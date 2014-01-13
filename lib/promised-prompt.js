'use strict';

var Blackbird = require('blackbird'),
    readline = require('./readline'); // patch readline, which 'read' depends on

module.exports = new Blackbird(function (Promise) {
    var read = Promise.promisify(require('read')),
        extend = require('xtend');
    
    function Prompt(opts, ctx) {
        this._opts = opts || { };
        extend(this, ctx || { });
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
        
        opts = extend({ }, this._opts, opts);
        
        if (opts.type === 'multi' && Array.isArray(opts.validator)) {
            console.log(
                '(' + opts.validator.map(function (a) {
                    return "'"+a+"'";
                }).join(', ') + ')'
            );
        } else if (opts.type === 'integer' && !opts.validator) {
            opts.validator = function (val) {
                var n = Number(val);
                return n == val && n == ~~n  && isFinite(n);
            }
        }
        msg = msg || opts.question || opts.key || '?';
        if (opts.default) { msg += ' [' + opts.default + ']'; }
        msg += ' ';
        
        return read({
            prompt: msg,
            silent: (opts.type === 'password'),
            replace: '*'
        }).then(function (res) {
            var val = res[0];
            // close this before tryAnswer, which runs some callbacks
            // that are allowed to re-call the parent for a new question chain
            return self.tryAnswer(val, opts);
            /*.catch(function (err) {
                if (opts.retry && opts.tries-- > 0) {
                    // try again
                } else {
                    throw err;
                }
            });*/
        });
    };
    Prompt.prototype.tryAnswer = function (val, opts) {
        var res;
        
        val = val || opts.default || null;
        
        if (opts.required && val === null) {
            return Promise.reject('Invalid input');
        }
        
        if (opts.type === 'boolean') {
            if (/^y|yes$/i.test(val)) { val = true; }
            else { val = false; }
        } else if (opts.type === 'integer') {
            // this gets automatically validated unless the user overrides it,
            // so we're assuming here that the result is valid and casting it
            // to an integer
            val = ~~val;
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
