'use strict';

var Prompt = require('./lib/promised-prompt'),
    Promise = Prompt.Promise,
    interfaces = require('os').networkInterfaces();

//var chalk = require('chalk');

var prompt = new Prompt({}, {
    addrs: [ ],
    iface: null
});

prompt()
.ask('Interface to use:', {
    key: 'iface',
    validate: Object.keys(interfaces),
    default: 'eth0'
})

.ask('Add an IPv6 subnet?', {
    type: 'boolean',
    default: 'N',
    ifTrue: function () { return prompt().ask('Enter subnet:').then(addSubnet); }
})

.then(function () {
    var addrs = interfaces[this.iface];
    this.v4addrs = addrs.filter(function (a) {
        return a.family === 'IPv4' && a.internal === false;
    });
    this.v6addrs = addrs.filter(function (a) {
        return a.family === 'IPv6' && a.internal === false;
    });
})

.ask(function () {
    var count = this.v4addrs.length;
    return {
        type: 'boolean',
        question: 'Use ' + count + ' IPv4 addresses?',
        default: count <= 1 ? 'N' : 'Y',
        ifTrue: function () { this.addrs = this.addrs.concat(this.v4addrs); }
    };
})

.ask(function () {
    var count = this.v6addrs.length;
    return {
        type: 'boolean',
        question: 'Use ' + count + ' IPv6 addresses?',
        default: count <= 1 ? 'N' : 'Y',
        ifTrue: function () { this.addrs = this.addrs.concat(this.v6addrs); }
    };
})

.then(function () {
    console.log(this);
});



var v6 = require('ipv6').v6,
    spawn = require('child_process').spawn;

// this = Prompt object
function addSubnet(subnet) {
    var iface = this.iface,
        proc = spawn('bash'),
        cmds = makeCommands(subnet).map(function (a) {
            return 'echo "ip -6 addr add ' + a + ' dev ' + iface + '"';
        }),
        deferred = Promise.defer();
    
    cmds.push('exit')
        
    proc.on('data', function (chunk) {
        console.log('>> ', chunk);
    });
    proc.on('close', function (code) {
        interfaces = require('os').networkInterfaces();
        if (code == 0) deferred.resolve();
        else deferred.reject(code);
    });
    proc.stdin.write(cmds.join('\n')+'\n');
    
    return deferred.promise;
}
function makeCommands(str) {
    var addr = new v6.Address(str), cmds = [ ];
    if (!addr.isValid() || addr.subnetMask == 128 || addr.v4) {
        throw new Error('Invalid IPv6 subnet: ' + str);
    }
    
    var start = new IPv6(addr.startAddress(), addr.subnetMask);
    var tmp = addr.endAddress();

    for (var j = 4; j < 8; j++) {
        tmp.parsedAddress[j] = '0';
    }
        
    var end = new IPv6(tmp, addr.subnetMask), newAddr;

    do {
        cmds.push(start.getAddr());
        start.add(64);
    } while (start.le(end));
    
    return cmds;
}

function IPv6(v6addr, mask) {
    var arr = [];
    for (var i = 0; i < 8; i++) {
        arr.push(parseInt(v6addr.parsedAddress[i], 16));
    }
    if (arr[7] === 0) {
        arr[7] = 1;
    }
    this.arr = arr;
    this.mask = mask || 128;
}
IPv6.prototype.lt = function (target) {
    for (var i = 0; i < 8; i++) {
        if (this.arr[i] < target.arr[i]) { return true; }
        if (this.arr[i] > target.arr[i]) { return false; }
    }
    if (this.arr[7] == target.arr[7]) { return false; }
    return true;
};
IPv6.prototype.le = function (target) {
    for (var i = 0; i < 8; i++) {
        if (this.arr[i] < target.arr[i]) { return true; }
        if (this.arr[i] > target.arr[i]) { return false; }
    }
    if (this.arr[7] == target.arr[7]) { return true; }
    return false;
};
IPv6.prototype.add = function (bits) {
    var i = 7;
    while (bits >= 16) {
        i--;
        bits -= 16;
    }

    this.arr[i] = (this.arr[i] + 1 << bits) & 0xffff;
};
IPv6.prototype.getAddr = function () {
    var newArr = this.arr.map(function (a) { return a.toString(16); });
    var i = newArr.indexOf('0');
    while (i > -1 && i < 8 && newArr[i] == 0) {
        newArr[i++] = null;
    }
    return newArr.join(':').replace(/:::+/, '::') + '/' + this.mask;
};
