"use strict";
/**
 * 后端服务器启动监听端口，并接受前端服务器的连接
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendServer = void 0;
var msgCoder_1 = require("./msgCoder");
var path = __importStar(require("path"));
var fs = __importStar(require("fs"));
var define = require("../util/define");
var session_1 = require("./session");
var protocol = __importStar(require("../connector/protocol"));
var BackendServer = /** @class */ (function () {
    function BackendServer(app) {
        this.msgHandler = {};
        this.app = app;
    }
    BackendServer.prototype.init = function () {
        session_1.initSessionApp(this.app);
        protocol.init(this.app);
        var mydog = require("../mydog");
        var connectorConfig = this.app.someconfig.connector || {};
        var connectorConstructor = connectorConfig.connector || mydog.connector.connectorTcp;
        var defaultEncodeDecode;
        if (connectorConstructor === mydog.connector.connectorTcp) {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        else if (connectorConstructor === mydog.connector.connectorWs) {
            defaultEncodeDecode = protocol.Ws_EncodeDecode;
        }
        else {
            defaultEncodeDecode = protocol.Tcp_EncodeDecode;
        }
        var encodeDecodeConfig = this.app.someconfig.encodeDecode || {};
        this.app.protoEncode = encodeDecodeConfig.protoEncode || defaultEncodeDecode.protoEncode;
        this.app.msgEncode = encodeDecodeConfig.msgEncode || defaultEncodeDecode.msgEncode;
        this.app.protoDecode = encodeDecodeConfig.protoDecode || defaultEncodeDecode.protoDecode;
        this.app.msgDecode = encodeDecodeConfig.msgDecode || defaultEncodeDecode.msgDecode;
        this.loadHandler();
    };
    /**
     * 后端服务器加载路由处理
     */
    BackendServer.prototype.loadHandler = function () {
        var dirName = path.join(this.app.base, define.some_config.File_Dir.Servers, this.app.serverType, "handler");
        var exists = fs.existsSync(dirName);
        if (exists) {
            var self_1 = this;
            fs.readdirSync(dirName).forEach(function (filename) {
                if (!/\.js$/.test(filename)) {
                    return;
                }
                var name = path.basename(filename, '.js');
                var handler = require(path.join(dirName, filename));
                if (handler.default && typeof handler.default === "function") {
                    self_1.msgHandler[name] = new handler.default(self_1.app);
                }
            });
        }
    };
    /**
     * 后端服务器收到前端服转发的客户端消息
     */
    BackendServer.prototype.handleMsg = function (id, msg) {
        var sessionLen = msg.readUInt16BE(1);
        var sessionBuf = msg.slice(3, 3 + sessionLen);
        var session = new session_1.Session();
        session.setAll(JSON.parse(sessionBuf.toString()));
        var cmdId = msg.readUInt16BE(3 + sessionLen);
        var cmdArr = this.app.routeConfig[cmdId].split('.');
        var data = this.app.msgDecode(cmdId, msg.slice(5 + sessionLen));
        this.msgHandler[cmdArr[1]][cmdArr[2]](data, session, this.callback(id, cmdId, session.uid));
    };
    BackendServer.prototype.callback = function (id, cmdId, uid) {
        var self = this;
        return function (msg) {
            if (msg === undefined) {
                msg = null;
            }
            var msgBuf = self.app.protoEncode(cmdId, msg);
            var buf = msgCoder_1.encodeRemoteData([uid], msgBuf);
            self.app.rpcPool.sendMsg(id, buf);
        };
    };
    /**
     * 后端session同步到前端
     */
    BackendServer.prototype.sendSession = function (sid, sessionBuf) {
        var buf = Buffer.allocUnsafe(5 + sessionBuf.length);
        buf.writeUInt32BE(1 + sessionBuf.length, 0);
        buf.writeUInt8(3 /* applySession */, 4);
        sessionBuf.copy(buf, 5);
        this.app.rpcPool.sendMsg(sid, buf);
    };
    /**
     * 后端服务器给客户端发消息
     */
    BackendServer.prototype.sendMsgByUidSid = function (cmdIndex, msg, uidsid) {
        var groups = {};
        var group;
        for (var _i = 0, uidsid_1 = uidsid; _i < uidsid_1.length; _i++) {
            var one = uidsid_1[_i];
            if (!one.sid) {
                continue;
            }
            group = groups[one.sid];
            if (!group) {
                group = [];
                groups[one.sid] = group;
            }
            group.push(one.uid);
        }
        var app = this.app;
        var msgBuf = app.protoEncode(cmdIndex, msg);
        for (var sid in groups) {
            var buf = msgCoder_1.encodeRemoteData(groups[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    };
    /**
     * 后端服务器给客户端发消息
     */
    BackendServer.prototype.sendMsgByGroup = function (cmdIndex, msg, group) {
        var app = this.app;
        var msgBuf = app.protoEncode(cmdIndex, msg);
        for (var sid in group) {
            if (group[sid].length === 0) {
                continue;
            }
            var buf = msgCoder_1.encodeRemoteData(group[sid], msgBuf);
            app.rpcPool.sendMsg(sid, buf);
        }
    };
    return BackendServer;
}());
exports.BackendServer = BackendServer;
