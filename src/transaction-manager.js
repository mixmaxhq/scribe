define(['lodash-amd/modern/objects/assign'], function (assign) {

  'use strict';

  return function (scribe) {
    function TransactionManager() {
      this._history = [];
      this._pendingTransactions = [];
      this._deferTime = null;
      this._deferTimeout = null;
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

      _runPendingTransactions: function() {
        clearTimeout(this._deferTimeout);
        this._deferTime = null;

        // Clone the current transactions and clear the array to make this function re-entrant.
        var pendingTransactions = this._pendingTransactions.slice(0);
        this._pendingTransactions = [];

        pendingTransactions.forEach(function(run) {
          this._start(run.recordMode);
        }, this);

        // If there is an error, don't prevent the transaction from ending.
        try {
          pendingTransactions.forEach(function(run) {
            if (run.transaction) {
              run.transaction();
            }
          });
        } finally {
          pendingTransactions.forEach(function() {
            this._end();
          }, this);
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
        this._pendingTransactions.push({
          transaction: transaction,
          recordMode: recordMode
        });
        this._runPendingTransactions();
      },

      /**
       * Schedules the specified transaction to be run after a length of
       * time not exceeding the specified delay.
       *
       * If, before the delay elapses, another transaction is scheduled with a
       * shorter delay, this transaction and the other transaction will both be
       * run after the shorter delay. If a transaction is scheduled to be run
       * immediately (using `run`), then all pending transactions will be run
       * immediately.
       *
       * Transactions are run in the order of their scheduling.
       *
       * In this way, multiple transactions may be consolidated even if they are
       * not run in the same call stack--the effect is the same as if the first
       * pending transaction nested the others.
       *
       * @param {function} transaction - An arbitrary function to run.
       *    Can be `null` or `undefined` to manually trigger 'content-changed'
       *    and record undo items.
       * @param {string} recordMode - Whether and how to record undo items
       *    before and after running the transaction. See the discussion on the
       *    similar argument to `run` for acceptable values. This is ignored if
       *    other transactions are pending–-the value for the first scheduled
       *    transaction determines whether the queue will be recorded or not
       *    when it has been completely processed.
       * @param {number} maxDelay - The maximum interval (in milliseconds) for
       *    which to wait before running _transaction_. _transaction_ will be
       *    run sooner if other transactions are scheduled before the delay
       *    elapses.
       */
      runDeferred: function(transaction, recordMode, maxDelay) {
        this._pendingTransactions.push({
          transaction: transaction,
          recordMode: recordMode
        });

        var newDeferTime = Date.now() + maxDelay;
        if (!this._deferTime || (newDeferTime < this._deferTime)) {
          this._deferTime = newDeferTime;

          clearTimeout(this._deferTimeout);
          this._deferTimeout = setTimeout(function() {
            this._runPendingTransactions();
          }.bind(this), maxDelay);
        }
      }
    });

    return TransactionManager;
  };
});
