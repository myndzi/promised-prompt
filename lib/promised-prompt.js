'use strict';

var Blackbird = require('blackbird'),
    readline = require('./readline');

module.exports = new Blackbird(function (Promise) {
    function Prompt(opts, ctx) {
        this._opts = opts || { };
        
        // copy over initialization variables
        ctx = ctx || { };
        for (var key in ctx) {
            if (ctx.hasOwnProperty(key)) {
                this[key] = ctx[key];
            }
        }
    }
    
    Prompt.prototype.ask = function (res, msg, opts) {
        var self = this;
        
        // if they passed a function, evaluate it to get the options argument
        if (typeof msg === 'function') { msg = msg.call(this); }
        if (typeof opts === 'function') { opts = opts.call(this); }
        
        if (!opts && typeof msg === 'object') {
            opts = msg;
            msg = undefined;
        }
        
        if (typeof opts === 'undefined') { opts = { }; }
        
        msg = msg || opts.question || opts.key || '?';
        if (opts.default) { msg += ' [' + opts.default + ']'; }
        msg += ' ';
        
        var deferred = Promise.defer();
        var rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.once('SIGINT', function () {
            rl.close();
            console.log();
            deferred.reject('SIGINT');
        });
        rl.question(msg, function (val) {
            // close this before tryAnswer, which runs some callbacks
            // that are allowed to re-call the parent for a new question chain
            rl.close();
            
            self.tryAnswer(val, opts).then(function (val) {
                deferred.resolve(val);
            }).catch(function (err) {
                if (opts.retry && opts.tries-- > 0) {
                    // try again
                } else {
                    throw err;
                }
            });
        });
        
        return deferred.promise;
    };
    Prompt.prototype.tryAnswer = function (val, opts) {
        var res;
        
        val = val || opts.default || null;
        
        if (val === null) { return ('Invalid input'); }
        
        if (opts.type === 'boolean') {
            if (/^y|yes$/i.test(val)) { val = true; }
            else { val = false; }
        }
        
        if (opts.before) { val = opts.before.call(this, val); }
        
        if (opts.validate) {
            res = this.tryValidate(val, opts.validate)
            if (!res) {
                return Promise.reject(res) || Promise.reject('Validation failed');
            }
        }
        
        if (opts.key) { this[opts.key] = val; }
        
        res = null;
        if (opts.after) {
            if (opts.type === 'boolean') {
                if (opts.ifTrue && val) res = opts.ifTrue.call(this);
                else if (opts.ifFalse && !val) res = opts.ifFalse.call(this);
            }
            
            if (res === null) res = opts.after.call(this, val);
            
            if (Promise.is(res)) { return res.return(val); }
        }
        
        return Promise.cast(val);
    };
    
    Prompt.prototype.tryValidate = function (val, validator) {
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
    
    Promise.extend('ask');
    
    return Prompt;
});
