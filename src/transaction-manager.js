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
       * Runs the specified transaction, then triggers 'content-changed'
       * and optionally records an undo item.
       *
       * Nested transactions are supported. 'content-changed' will be triggered,
       * and an undo item recorded (if appropriate), after the transaction
       * stack unwinds.
       *
       * @param {function=} transaction - An arbitrary function to run.
       *    Can be `null` or `undefined` to manually trigger 'content-changed'
       *    and record an undo item.
       * @param {boolean=} recordTransaction - Whether to record an undo item
       *    after the transaction has been run. Defaults to `true`. This is
       *    ignored if _transaction_ is nested--the value for the root
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
