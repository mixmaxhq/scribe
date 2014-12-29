define([
    '../../../../element',
    'lodash-amd/modern/collections/contains'
  ], function (
    element,
    contains
  ) {

  /**
   * Chrome and Firefox: All elements need to contain either text or a `<br>` to
   * remain selectable. (Unless they have a width and height explicitly set with
   * CSS(?), as per: http://jsbin.com/gulob/2/edit?html,css,js,output)
   */

  'use strict';

  // These are elements that cannot contain elements as content.
  var html5ChildlessElements = [
    // The void elements:
    // http://www.w3.org/TR/html-markup/syntax.html#syntax-elements
    'AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT',
    'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR',
    // Elements from http://w3c.github.io/html-reference/elements.html#elements
    // that can contain neither phrasing nor flow content, but only character data:
    'IFRAME', 'OPTION', 'SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE'
  ];

  function parentHasNoTextContent(element, node) {
    if (element.isCaretPositionNode(node)) {
      return true;
    } else {
      return node.parentNode.textContent.trim() === '';
    }
  }


  function traverse(element, parentNode) {
    // Instead of TreeWalker, which gets confused when the BR is added to the dom,
    // we recursively traverse the tree to look for an empty node that can have childNodes

    var node = parentNode.firstElementChild;

    function isEmpty(node) {

      if ((node.children.length === 0 && element.isBlockElement(node))
        || (node.children.length === 1 && element.isSelectionMarkerNode(node.children[0]))) {
         return true;
      }

      // Do not insert BR in empty non block elements with parent containing text
      if (!element.isBlockElement(node) && node.children.length === 0) {
        return parentHasNoTextContent(element, node);
      }

      return false;
    }

    while (node) {
      if (!element.isSelectionMarkerNode(node)) {
        // Find any node that contains no child *elements*, or just contains
        // whitespace, and *can* contain child elements
        if (isEmpty(node) &&
          node.textContent.trim() === '' &&
          !contains(html5ChildlessElements, node.nodeName)) {
          node.appendChild(document.createElement('br'));
        } else if (node.children.length > 0) {
          traverse(element, node);
        }
      }
      node = node.nextElementSibling;
    }
  }

  return function () {
    return function (scribe) {

      scribe.registerHTMLFormatter('normalize', function (html) {
        var bin = document.createElement('div');
        bin.innerHTML = html;

        traverse(scribe.element, bin);

        return bin.innerHTML;
      });

    };
  };

});
