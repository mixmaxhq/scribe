define([
  'lodash-amd/modern/objects/assign',
  './event'
], function (
  assign,
  eventHelpers
) {

  'use strict';

  var DELETE_KEY_CODE = 8;

  return function (scribe) {
    function TypingHistoryManager() {
      /// 'forward' if the user is adding text, 'backward' if the user is
      /// deleting text.
      this._typingDirection = 'forward';
      this._lastTwoChars = [];
      this._lastEventInfo = null;

      this._beginRecordingHistory();
    }

    assign(TypingHistoryManager.prototype, {
      _beginRecordingHistory: function() {
        /**
         * We record history on 'keydown' rather than 'input' because we want to
         * save the editor _before_ the user modifies the text, and only when
         * the user types (whereas 'input' is also triggered whenever a native
         * command e.g. `document.execCommand('bold')` executes and causes the
         * content to change).
         *
         * We record history on 'keydown' rather than 'keypress' because we
         * need to observe when the user presses delete.
         */
        scribe.el.addEventListener('keydown', this._onKeydown.bind(this));
      },

      /**
       * Processes a keydown event into information relevant to determining
       * whether or not to record an undo item.
       */
      _keydownEventInfo: function(e) {
        var charTyped = null;
        if (!e.metaKey && !e.ctrlKey) {
          var charCode = eventHelpers.charCodeForKeydownEvent(e);
          if (charCode) {
            charTyped = String.fromCharCode(charCode);
          }
        }

        var typingDirection;
        if (e.keyCode === DELETE_KEY_CODE) {
          typingDirection = 'backward';
        } else if (charTyped) {
          typingDirection = 'forward';
        }

        return {
          charTyped: charTyped,
          typingDirection: typingDirection
        };
      },

      /**
       * Observes keydown events and records an undo item when the user:
       *  - creates a new line
       *  - finishes a word
       *  - switches typing direction e.g. starts deleting text after adding
       *    text, or starts adding text after deleting text.
       */
      _onKeydown: function(e) {
        this.popEvent();

        var eventInfo = this._keydownEventInfo(e);
        var recordEvent = false;

        // Update the typing state from event info.
        if (eventInfo.charTyped) {
          this._lastTwoChars.push(eventInfo.charTyped);
          if (this._lastTwoChars.length > 2) {
            this._lastTwoChars.shift();
          }
        }

        var typingDirectionSwitched = false;
        if (eventInfo.typingDirection && (eventInfo.typingDirection !== this._typingDirection)) {
          this._typingDirection = eventInfo.typingDirection;
          typingDirectionSwitched = true;
        }

        // Determine whether to record an event given the typing state.
        if (typingDirectionSwitched) {
          recordEvent = true;

          // Clear the character history if the user has started to delete because it won't be
          // current when the user starts typing again (and at that point, we'll record a
          // history event anyway).
          if (eventInfo.typingDirection === 'backward') {
            this._lastTwoChars = [];
          }
        } else if (eventInfo.charTyped) {
          if (/[\r\n]/.test(eventInfo.charTyped)) {
            // If the user just created a new line, record a history event and
            // reset the character history.
            recordEvent = true;
            this._lastTwoChars = [];
          } else {
            if (this._lastTwoChars.length === 2) {
              var finishedWord = /\w\W/.test(this._lastTwoChars.join(''));
              if (finishedWord) {
                recordEvent = true;
                this._lastTwoChars = [];
              }
            }
          }
        }

        if (recordEvent) {
          scribe.pushHistory();
        }

        // This keydown event is considered typing-related if a character was
        // typed or the user is deleting text.
        if (eventInfo.charTyped ||
            (eventInfo.typingDirection === 'backward')) {
          this._pushEvent(eventInfo);
        }
      },

      _pushEvent: function(eventInfo) {
        this._lastEventInfo = eventInfo;
      },

      /**
       * Returns `true` if the typing history manager has examined a typing
       * event (i.e. the user typed a character or the user is deleting text)
       * since the last time that this was called, `false` otherwise.
       */
      popEvent: function() {
        var eventInfo = this._lastEventInfo;
        this._lastEventInfo = null;
        return !!eventInfo;
      }
    });

    return TypingHistoryManager;
  };
});
