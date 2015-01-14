define([], function () {

  'use strict';

  /**
   * Converts 'keydown' key codes to 'keypress' keycodes i.e. char codes.
   *
   * Thanks to http://stackoverflow.com/a/13127566/495611 and
   * http://stackoverflow.com/a/12467610/495611 for inspiring this function.
   *
   * @bug The browser emits the same key code, 229 for every diacritic as well as
   *    the character immediately following the diacritic (that becomes marked up by
   *    the diacritic). This function merely returns 229, 'å', in such cases. Tested
   *    in Chrome 39.0.2171.95.
   *
   * @param {Event} e - A 'keydown' event.
   *
   * @return {number|undefined} The character code corresponding to the key
   *    pressed, or 'undefined' if the key pressed is not printable.
   */
  function charCodeForKeydownEvent(e) {
    var keyCode = e.keyCode;
    var charCode;

    // First check ranges/individual values that map straightforwardly.
    if ((keyCode > 64) && (keyCode < 91)) {
      // Alphabet keys. Lowercase keys are offset by 32.
      charCode = e.shiftKey ? keyCode : keyCode + 32;

    } else if ((keyCode > 95) && (keyCode < 106)) {
      // Numerical numpad keys. Transform to the regular number keys.
      charCode = keyCode - 48;

    } else if ((keyCode === 32) || (keyCode === 13)) {
      // Spacebar & return keys.
      charCode = keyCode;

    } else {
      // Fall back to the map.
      var keyCodesToCharCodes = {
        // Number keys.
        48: e.shiftKey ? 41 : 48,
        49: e.shiftKey ? 33 : 49,
        50: e.shiftKey ? 64 : 50,
        51: e.shiftKey ? 35 : 51,
        52: e.shiftKey ? 36 : 52,
        53: e.shiftKey ? 37 : 53,
        54: e.shiftKey ? 94 : 54,
        55: e.shiftKey ? 38 : 55,
        56: e.shiftKey ? 42 : 56,
        57: e.shiftKey ? 40 : 57,

        // *+-./ on a numpad.
        106: 42,
        107: 43,
        109: 45,
        110: 46,
        111: 47,

        // ;=,-./` (in order)
        186: e.shiftKey ? 58 : 59, 
        187: e.shiftKey ? 43 : 61, 
        188: e.shiftKey ? 60 : 44,
        189: e.shiftKey ? 95 : 45,
        190: e.shiftKey ? 62 : 46,
        191: e.shiftKey ? 63 : 47,
        192: e.shiftKey ? 126 : 96,

        // [\] (in order)
        219: e.shiftKey ? 123 : 91,
        220: e.shiftKey ? 124 : 92,
        221: e.shiftKey ? 125 : 93,

        // '
        222: e.shiftKey ? 34 : 39,

        // Diacritic marks. See the method description.
        229: 229
      };

      if (keyCodesToCharCodes.hasOwnProperty(keyCode)) {
        charCode = keyCodesToCharCodes[keyCode];
      }
    }

    return charCode;
  }

  return {
    charCodeForKeydownEvent: charCodeForKeydownEvent
  };

});
