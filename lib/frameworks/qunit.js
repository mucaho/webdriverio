var q = require('q'),
    co = require('co'),
    path = require('path'),
    util = require('util'),
    EOL = require('os').EOL,
    isGeneratorFn = require('is-generator').fn,
    hasES6Support = require('../helpers/detectHarmony');

/**
 * QUnit runner
 */
module.exports.run = function(config, specs, capabilities) {
    var defer = q.defer();

    function sendMessage(evt, title, duration, error) {
        var suiteName = 'QUnit test suite';
        var message = {
            event: evt,
            pid: process.pid,
            title: title || suiteName,
            pending: false,
            parent: evt.indexOf('test') >= 0 ? suiteName : null,
            type: evt.indexOf('test') >= 0 ? 'test' : 'suite',
            file: undefined,
            err: error || {},
            duration: duration,
            runner: {}
        }; message.runner[process.pid] = capabilities;
        process.send(message);
    };

    // setup QUnit
    var QUnit = GLOBAL.QUnit = require('qunitjs');
    QUnit.config.autorun = false;
    QUnit.config.autostart = false;
    setupMessageCallbacks(QUnit, sendMessage);

    q(config.before()).then(function() {
        try {
            // run QUnit tests
            specs.forEach(require);

            // start & end QUnit
            QUnit.done(function(details) {
                defer.resolve.call(defer, details.failed);
            });
            QUnit.load();
            QUnit.start();
        } catch(e) {
            defer.reject({
                message: e.message,
                stack: e.stack
            });
        }
    }, defer.reject.bind(defer));

    return defer.promise;
};



function setupMessageCallbacks(QUnit, sendMessage) {
    QUnit.begin(function(details) {
        sendMessage('suite:start', '', 0, undefined);
    });

    var error = undefined;
    QUnit.testStart(function(details) {
        error = undefined;

        var testName = (details.module || 'Default module') + ' - ' + (details.name || 'Unnamed test');
        sendMessage('test:start', testName, 0, error);
    });
    QUnit.log(function(details) {
        if (!details.result && !error) {
            var msg = 'Actual value ' + util.inspect(details.actual) + ' does not match expected value ' + util.inspect(details.expected) + '.';
            error = {
                message: 'Description: ' + details.message + EOL + 'Reason: ' + msg,
                stack: details.source
            };
        }
    });
    QUnit.testDone(function(details) {
        var testName = (details.module || 'Default module') + ' - ' + (details.name || 'Unnamed test');

        sendMessage('test:end', testName, details.runtime, error);
        if (details.total === 0)
            sendMessage('test:pending', testName, details.runtime, error);
        else if (details.failed > 0)
            sendMessage('test:fail', testName, details.runtime, error);
        else if (details.passed === details.total)
            sendMessage('test:pass', testName, details.runtime, error);
    });

    QUnit.done(function(details) {
        sendMessage('suite:end', '', details.runtime, undefined);
    });
}