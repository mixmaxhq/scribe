define([
  'lodash-amd/modern/objects/defaults',
  './plugins/core/commands',
  './plugins/core/events',
  './plugins/core/formatters/html/replace-nbsp-chars',
  './plugins/core/formatters/html/enforce-p-elements',
  './plugins/core/formatters/html/ensure-selectable-containers',
  './plugins/core/formatters/plain-text/escape-html-characters',
  './plugins/core/inline-elements-mode',
  './plugins/core/patches',
  './plugins/core/set-root-p-element',
  './api',
  './transaction-manager',
  './undo-manager',
  './typing-history-manager',
  './event-emitter',
  './element',
  './node',
  'immutable/dist/immutable'
], function (
  defaults,
  commands,
  events,
  replaceNbspCharsFormatter,
  enforcePElements,
  ensureSelectableContainers,
  escapeHtmlCharactersFormatter,
  inlineElementsMode,
  patches,
  setRootPElement,
  Api,
  buildTransactionManager,
  buildUndoManager,
  buildTypingHistoryManager,
  EventEmitter,
  elementHelpers,
  nodeHelpers,
  Immutable
) {

  'use strict';

  function Scribe(el, options) {
    EventEmitter.call(this);

    this.el = el;
    this.commands = {};
    this.options = defaults(options || {}, {
      allowBlockElements: true,
      debug: false
    });
    this.commandPatches = {};
    this._plainTextFormatterFactory = new FormatterFactory();
    this._htmlFormatterFactory = new HTMLFormatterFactory();

    this.api = new Api(this);

    this.node = nodeHelpers;
    this.element = elementHelpers;

    this.Immutable = Immutable;

    var TransactionManager = buildTransactionManager(this);
    this.transactionManager = new TransactionManager();

    var UndoManager = buildUndoManager(this);
    this.undoManager = new UndoManager();

    var TypingHistoryManager = buildTypingHistoryManager(this);
    this.typingHistoryManager = new TypingHistoryManager();

    this.el.setAttribute('contenteditable', true);

    this.el.addEventListener('input', function () {
      /**
       * This event triggers when either the user types something or a native
       * command is executed which causes the content to change (i.e.
       * `document.execCommand('bold')`). We can't wrap a transaction around
       * the latter actions, so we instead run a transaction (for both sorts
       * of changes) in this event.
       *
       * We defer the transaction until the next turn of the event loop in case
       * this input event caused a DOM mutation, so that when the mutation
       * observer fires (after this event), this transaction and the formatter
       * transaction will be applied together. This will consolidate
       * 'content-changed' events and undo items.
       *
       * TODO: Have the mutation observer listen to node modification events, not just additions and
       * deletions. That would allow this input listener to be replaced entirely.
       * https://github.com/guardian/scribe/issues/144
       */
      var recordMode;
      if (this.typingHistoryManager.popEvent()) {
        // This transaction is typing-related--don't record an undo item,
        // because the relevant history changes have been saved (if appropriate)
        // by the typing history manager.
        recordMode = 'skip';
      } else {
        // This transaction is command-related--replace the last history item
        // (created by the command) with that created by the formatters.
        recordMode = 'replace';
      }
      this.transactionManager.runDeferred(null, recordMode, 0);
    }.bind(this), false);

    /**
     * Core Plugins
     */

    if (this.allowsBlockElements()) {
      // Commands assume block elements are allowed, so all we have to do is
      // set the content.
      // TODO: replace this by initial formatter application?
      this.use(setRootPElement());
      // Warning: enforcePElements must come before ensureSelectableContainers
      this.use(enforcePElements());
      this.use(ensureSelectableContainers());
    } else {
      // Commands assume block elements are allowed, so we have to set the
      // content and override some UX.
      this.use(inlineElementsMode());
    }

    // Formatters
    this.use(escapeHtmlCharactersFormatter());
    this.use(replaceNbspCharsFormatter());


    // Patches

    var mandatoryPatches = [
      patches.commands.bold,
      patches.commands.indent,
      patches.commands.insertHTML,
      patches.commands.insertList,
      patches.commands.outdent,
      patches.commands.createLink,
      patches.events
    ];

    var mandatoryCommands = [
      commands.indent,
      commands.insertList,
      commands.outdent,
      commands.redo,
      commands.subscript,
      commands.superscript,
      commands.undo,
    ];

    var allPlugins = [].concat(mandatoryPatches, mandatoryCommands);

    allPlugins.forEach(function(plugin) {
      this.use(plugin());
    }.bind(this));

    this.use(events());
  }

  Scribe.prototype = Object.create(EventEmitter.prototype);

  // For plugins
  // TODO: tap combinator?
  Scribe.prototype.use = function (configurePlugin) {
    configurePlugin(this);
    return this;
  };

  Scribe.prototype.setHTML = function (html, skipFormatters) {
    if (skipFormatters) {
      this._skipFormatters = true;
    }
    this.el.innerHTML = html;
  };

  Scribe.prototype.getHTML = function () {
    return this.el.innerHTML;
  };

  Scribe.prototype.getContent = function () {
    // Remove bogus BR element for Firefox — see explanation in BR mode files.
    return this._htmlFormatterFactory.formatForExport(this.getHTML().replace(/<br>$/, ''));
  };

  Scribe.prototype.getTextContent = function () {
    return this.el.textContent;
  };

  Scribe.prototype.pushHistory = function (amendIfOnlyCursorChanged) {
    /**
     * Chrome and Firefox: If the selection is collapsed and we execute a command, then modify the
     * DOM in any way, e.g. by placing/removing the markers, it will break browser magic around
     * `Document.queryCommandState` (http://jsbin.com/eDOxacI/1/edit?js,console,output). So, only
     * create an undo item if necessary--if the content and/or cursor position has changed.
     *
     * Note that we need to create an undo item in order to check whether the cursor position has
     * changed, hence clients being able to control this check using _amendIfOnlyCursorChanged_.
     * We generally do want to update the cursor position when saving the history, though, hence
     * it defaulting to `true`.
     */
    var createUndoItem = function() {
      var selection = new this.api.Selection();
      selection.placeMarkers();
      var undoItem = this.getHTML();
      selection.removeMarkers();
      return undoItem;
    }.bind(this);

    if (amendIfOnlyCursorChanged === undefined) {
      amendIfOnlyCursorChanged = true;
    }

    // We only want to push the history if the content and/or cursor position
    // actually changed.
    var previousUndoItem = this.undoManager.stack[this.undoManager.position];
    var previousContent = previousUndoItem && previousUndoItem
        .replace(/<em class="scribe-marker">/g, '').replace(/<\/em>/g, '');

    var newContent = this.getHTML();

    // The content changed if there was not a previous undo item or if the items' content differs.
    var contentChanged = (newContent !== previousContent);
    if (contentChanged) {
      this.undoManager.push(createUndoItem());
      return true;
    } else if (amendIfOnlyCursorChanged) {
      var newUndoItem = createUndoItem();
      // The cursor changed if the content didn't change but the undo items differ.
      var cursorChanged = (newUndoItem !== previousUndoItem);
      if (cursorChanged) {
        // If the cursor did change, replace the current entry vs. pushing a new entry, since
        // undoing a cursor change alone doesn’t make a lot of sense.
        this.undoManager.undo();
        this.undoManager.push(newUndoItem);
        return true;
      }
    }

    return false;
  };

  Scribe.prototype.getCommand = function (commandName) {
    return this.commands[commandName] || this.commandPatches[commandName] || new this.api.Command(commandName);
  };

  Scribe.prototype.restoreFromHistory = function (historyItem) {
    this.setHTML(historyItem, true);

    // Restore the selection
    var selection = new this.api.Selection();
    selection.selectMarkers();

    // Because we skip the formatters, a transaction is not run, so we have to
    // emit this event ourselves.
    this.trigger('content-changed');
  };

  // This will most likely be moved to another object eventually
  Scribe.prototype.allowsBlockElements = function () {
    return this.options.allowBlockElements;
  };

  Scribe.prototype.setContent = function (content) {
    if (! this.allowsBlockElements()) {
      // Set bogus BR element for Firefox — see explanation in BR mode files.
      content = content + '<br>';
    }

    this.setHTML(content);

    this.trigger('content-changed');
  };

  Scribe.prototype.insertPlainText = function (plainText) {
    this.insertHTML('<p>' + this._plainTextFormatterFactory.format(plainText) + '</p>');
  };

  Scribe.prototype.insertHTML = function (html) {
    /**
     * When pasting text from Google Docs in both Chrome and Firefox,
     * the resulting text will be wrapped in a B tag. So it would look
     * something like <b><p>Text</p></b>, which is invalid HTML. The command
     * insertHTML will then attempt to fix this content by moving the B tag
     * inside the P. The result is: <p><b></b></p><p>Text</p>, which is valid
     * but means an extra P is inserted into the text. To avoid this we run the
     * formatters before the insertHTML command as the formatter will
     * unwrap the P and delete the B tag. It is acceptable to remove invalid
     * HTML as Scribe should only accept valid HTML.
     *
     * See http://jsbin.com/cayosada/3/edit for more
     **/

    // TODO: error if the selection is not within the Scribe instance? Or
    // focus the Scribe instance if it is not already focused?
    this.getCommand('insertHTML').execute(this._htmlFormatterFactory.format(html));
  };

  Scribe.prototype.isDebugModeEnabled = function () {
    return this.options.debug;
  };

  Scribe.prototype.registerHTMLFormatter = function (phase, fn) {
    this._htmlFormatterFactory.formatters[phase]
      = this._htmlFormatterFactory.formatters[phase].push(fn);
  };

  Scribe.prototype.registerPlainTextFormatter = function (fn) {
    this._plainTextFormatterFactory.formatters
      = this._plainTextFormatterFactory.formatters.push(fn);
  };

  // TODO: abstract
  function FormatterFactory() {
    this.formatters = Immutable.List();
  }

  FormatterFactory.prototype.format = function (html) {
    // Map the object to an array: Array[Formatter]
    var formatted = this.formatters.reduce(function (formattedData, formatter) {
      return formatter(formattedData);
    }, html);

    return formatted;
  };

  function HTMLFormatterFactory() {
    // Define phases
    // For a list of formatters, see https://github.com/guardian/scribe/issues/126
    this.formatters = {
      // Configurable sanitization of the HTML, e.g. converting/filter/removing
      // elements
      sanitize: Immutable.List(),
      // Normalize content to ensure it is ready for interaction
      normalize: Immutable.List(),
      'export': Immutable.List()
    };
  }

  HTMLFormatterFactory.prototype = Object.create(FormatterFactory.prototype);
  HTMLFormatterFactory.prototype.constructor = HTMLFormatterFactory;

  HTMLFormatterFactory.prototype.format = function (html) {
    var formatters = this.formatters.sanitize.concat(this.formatters.normalize);

    var formatted = formatters.reduce(function (formattedData, formatter) {
      return formatter(formattedData);
    }, html);

    return formatted;
  };

  HTMLFormatterFactory.prototype.formatForExport = function (html) {
    return this.formatters['export'].reduce(function (formattedData, formatter) {
      return formatter(formattedData);
    }, html);
  };

  return Scribe;

});
