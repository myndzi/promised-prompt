'use strict';

var readline = require('readline');

var nodeVersions = process.version.match(/^v(\d+)\.(\d+)\.(\d+)$/),
    nodeMajor = Number(nodeVersions[1]),
    nodeMinor = Number(nodeVersions[2]),
    nodePatch = Number(nodeVersions[3]);

// Monkey patch readline to not fuck up length calculations on ansi colored text
if (nodeMajor === 0 && nodeMinor <= 10) {
    var metaKeyCodeRE = /(?:\x1b)([a-zA-Z0-9])/g;
    var functionKeyCodeRE = /(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/g;
    
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
}

module.exports = readline;
