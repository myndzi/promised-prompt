'use strict';

module.exports = Prompt;

var Promise = require('bluebird'),
    readline = require('readline'),
    extend = require('jquery-extend');

var chalk = require('chalk');

// chalk uses has-color
// has-color doesn't recognize 'screen' as a color-able environment
if (process.env.TERM == 'screen') {
    // TODO: is it possible that 'screen' doesn't support color? how to tell?
    chalk.enabled = true;
}

var nodeVersions = process.version.match(/^v(\d+)\.(\d+)\.(\d+)$/),
    nodeMajor = Number(nodeVersions[1]),
    nodeMinor = Number(nodeVersions[2]),
    nodePatch = Number(nodeVersions[3]);

// Monkey patch readline to not fuck up length calculations on ansi colored text
if (nodeMajor === 0 && nodeMinor <= 10) {
    var stripControlChars = function (str) {
        str = str.replace(metaKeyCodeRE, '');
        return str.replace(functionKeyCodeRE, '');
    }
    
    var setPrompt = readline.Interface.prototype.setPrompt;
    
    readline.Interface.prototype.setPrompt = function (prompt, length) {
        if (length) {
            return setPrompt.call(this, prompt, length);
        } else {
            var cleanPrompt = stripControlChars(prompt);
            setPrompt.call(this, cleanPrompt);
            setPrompt.call(this, prompt, this._promptLength);
        }
    };
    
    var metaKeyCodeRE = /(?:\x1b)([a-zA-Z0-9])/g;
    var functionKeyCodeRE = /(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/g;
}

var defaults = {
    suffix: ' '
}, theme = {
    question: chalk.green,
    warn: chalk.yellow,
    error: chalk.red,
    default: function (str) {
        return str ? chalk.gray(' (' + str + ')') : '';
    }
};

function Prompt(opts) {
    this.opts = extend({ }, defaults, opts);
    this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    this.rl.on('SIGINT', function () {
        if (this._deferred) {
            this._deferred.reject('SIGINT');
            this._deferred = null;
        } else {
            throw new Error('Got SIGINT');
        }
    }.bind(this));
    this.closed = false;
    this.theme = extend({ }, theme, this.opts.theme);
    
    this.res = [ ];
    
    this._deferred = null;
    this._opts = null;
    
    var self = this;
    ['ask', 'done', 'fail'].forEach(function (method) {
        self[method] = self[method].bind(self);
    });
}
Prompt.prototype.ask = function (question, opts) {
    var self = this;
    
    self._checkClosed();
    opts = opts || { };
    if (typeof question === 'string') {
        opts.question = opts.question || question;
    } else {
        opts = question;
    }
    opts = self._opts = extend({ }, self.opts, opts);
    
    if (!(typeof opts.question === 'string')) {
        return Promise.reject('No question given!');
    }
    
    return self._tryAsk().catch(self.fail);
};
Prompt.prototype.fail = function (err) {
    var self = this;
    
    console.log(self.theme.error(err));
    if (err.stack) console.log(err.stack);
    
    throw err;
};

Prompt.prototype._tryAsk = function () {
    var self = this;
    
    self._checkClosed();
    var opts = self._opts;
    self._deferred = Promise.defer();
    self.rl.question(
        self.theme.question(opts.question) +
        self.theme.default(opts.default) +
        self.theme.question(opts.suffix),
    
        self._tryAnswer.bind(self)
    );
    return self._deferred.promise;
};
Prompt.prototype._tryAnswer = function (val) {
    var self = this;
    
    self._checkClosed();
    var deferred = self._deferred, promise = Promise.resolve();
    
    if (val === '') val = self._opts.default || null;
    
    if (self._opts.validate && !self._tryValidate(val)) {
        return deferred.resolve(
            Promise.try(self._tryReask.bind(self), val)
                .catch(self.fail)
        );
    }

    if (typeof self._opts.after === 'function') {
        promise = promise.then(self._opts.after);
    }

    if (self._opts.boolean) {
        switch (val.toLowerCase()) {
            case 'y':
                val = true;
            break;
            case 'n':
                val = false;
            break;
            default:
                val = val ? true : false;
            break;
        }
    }
    
    promise = promise.then(function () {
        self._opts = null;
        self._deferred = null;
        
        self.res.push(val);
        return val;
    });
    
    deferred.resolve(promise);
    
    return promise;
};
Prompt.prototype._tryValidate = function (val) {
    var self = this;
    self._checkClosed();
    
    var validator = self._opts.validate;
    
    if (typeof validator === 'function') {
        return validator(val) ? true : false;
    } else if (validator instanceof RegExp) {
        return validator.test(val) ? true : false;
    } else if (Array.isArray(validator)) {
        return validator.indexOf(val) > -1 ? true : false;
    } else {
        return false;
    }
};

Prompt.prototype._tryReask = function (err) {
    var self = this;

    self._checkClosed();
    err = err || self._opts.validationMsg || 'Invalid input';

    if (typeof self._opts.tries === 'number') {
        if (self._opts.tries--) {
            console.log(self.theme.warn(err));

            return self._tryAsk();
        }
    }
    throw err;
};
Prompt.prototype._checkClosed = function () {
    if (this.closed) throw new Error('Prompt interface has been closed already!');
};
Prompt.prototype.done = function () {
    this.rl.close();
    this.closed = true;
};
