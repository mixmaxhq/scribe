define(['lodash-amd/modern/objects/assign'], function (assign) {

  'use strict';

  return function (scribe) {
    function TransactionManager() {
      this._history = [];
    }

    assign(TransactionManager.prototype, {
      _start: function (recordMode) {
        if (recordMode === undefined) {
          recordMode = 'push';
        }
        if ((recordMode !== 'skip') && (this._history.length === 0)) {
          // If, at the end of the transaction, we're either going to push a new
          // undo item or replace the current one, save the current state first.
          // Note that `pushHistory` will not push an item if the content
          // hasn't changed since the last save.
          scribe.pushHistory();
        }

        this._history.push(recordMode);
      },

      _end: function () {
        var recordMode = this._history.pop();

        if (this._history.length === 0) {
          switch (recordMode) {
            case 'push':
              scribe.pushHistory();
              break;
            case 'replace':
              scribe.undoManager.undo();
              scribe.pushHistory();
              break;
          }
          scribe.trigger('content-changed');
        }
      },

      /**
       * Runs the specified transaction, then triggers 'content-changed',
       * optionally recording undo items before and after running the
       * transaction.
       *
       * Nested transactions are supported. An undo item will be recorded (if
       * appropriate) before the root transaction begins; 'content-changed' will
       * be triggered and another undo item recorded (if appropriate) after the
       * transaction stack unwinds.
       *
       * @param {function=} transaction - An arbitrary function to run.
       *    Can be `null` or `undefined` to manually trigger 'content-changed'
       *    and record undo items.
       * @param {string=} recordMode - Whether and how to record undo items
       *    before and after running the transaction; one of the following:
       *      - 'push': Records an undo item before running the transaction,
       *        if the state was dirty, and records another undo item after
       *        running the transaction.
       *      - 'replace': Records an undo item before running the transaction,
       *        if the state was dirty, and replaces the current undo item after
       *        running the transaction.
       *      - 'skip': Does not record undo items, neither before nor after
       *        running the transaction.
       *    Defaults to `push`. This is ignored if _transaction_ is nested–-the
       *    value for the root transaction determines whether the state will be
       *    recorded or not when the stack unwinds.
       */
      run: function (transaction, recordMode) {
        this.start(recordMode);
        // If there is an error, don't prevent the transaction from ending.
        try {
          if (transaction) {
            transaction();
          }
        } finally {
          this.end();
        }
      }
    });

    return TransactionManager;
  };
});
