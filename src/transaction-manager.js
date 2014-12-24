define(['lodash-amd/modern/objects/assign'], function (assign) {

  'use strict';

  return function (scribe) {
    function TransactionManager() {
      this.history = [];
    }

    assign(TransactionManager.prototype, {
      start: function (recordTransaction) {
        if (recordTransaction === undefined) {
          recordTransaction = true;
        }
        if (recordTransaction && (this.history.length === 0)) {
          // Note that `pushHistory` will not push an item if the content
          // hasn't changed since the last save.
          scribe.pushHistory();
        }

        this.history.push(recordTransaction);
      },

      end: function () {
        var recordTransaction = this.history.pop();

        if (this.history.length === 0) {
          if (recordTransaction) {
            scribe.pushHistory();
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
       * @param {boolean=} recordTransaction - Whether to record undo items
       *    before and after running the transaction. Defaults to `true`. This
       *    is ignored if _transaction_ is nested--the value for the root
       *    transaction determines whether the stack will be recorded
       *    or not when the stack unwinds.
       */
      run: function (transaction, recordTransaction) {
        this.start(recordTransaction);
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
