const pino = require("pino");
const path = require("path");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  delay,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const { numToJid } = require("./utils.js");
const { PausedChats } = require("../database");
const config = require("../config");
const plugins = require("./plugins");
const { serialize, Greetings } = require("./index");
const { Image, Message, Sticker, Video, AllMessage } = require("./Messages");
const io = require("socket.io-client");
const { connectSession } = require("./session")
const {
  loadMessage,
  saveMessage,
  saveChat,
  getName,
} = require("../database/StoreDb");
const { exec } = require("child_process");
const logger = pino({ level: "silent" });
const connect = async () => {
  const connectToWhatsApp = async () => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState("./session/");
      const { version, isLatest } = await fetchLatestBaileysVersion();

      const conn = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: true,
    logger,
    browser: Browsers.macOS("Desktop"),
    downloadHistory: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    emitOwnEvents: true,
    version,
    getMessage: async (key) =>
      (loadMessage(key.id) || {}).message || { conversation: null },
  });
      conn.ev.on("connection.update", async (node) => {
      const { connection, lastDisconnect } = node;
		if (connection == 'open') {
			console.log("Connecting to Whatsapp...");
			console.log('Connected');
			await delay(5000);
			const packageVersion = require("../package.json").version;
            const totalPlugins = plugins.commands.length;
            const workType = config.WORK_TYPE;
			const sudo = numToJid(config.SUDO.split(',')[0]) || conn.user.id;
			const startMsg = `*𝗥𝗨𝗗𝗛𝗥𝗔 𝗦𝗧𝗔𝗥𝗧𝗘𝗗!*\n\n𝗩𝗲𝗿𝘀𝗶𝗼𝗻 : ${packageVersion}\n𝗣𝗿𝗲𝗳𝗶𝘅 : ${config.HANDLERS}\n𝗠𝗼𝗱𝗲 : ${workType}\n𝗣𝗹𝘂𝗴𝗶𝗻𝘀 : ${totalPlugins}\n𝗦𝘂𝗱𝗼 : ${config.SUDO}\n`;
			await conn.sendMessage(sudo, { text: startMsg });
    }

        if (connection === 'close') {
			if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
				await delay(300);
				connectToWhatsApp();
				console.log('Reconnecting...');
				console.log(node)
			} else {
				console.log('Connection Closed');
				await delay(3000);
				process.exit(0);
			}
		}
	});

      conn.ev.on("creds.update", saveCreds);
      conn.ev.on("group-participants.update", async (data) => {
        Greetings(data, conn);
      });
      conn.ev.on("chats.update", async (chats) => {
        chats.forEach(async (chat) => {
          await saveChat(chat);
        });
      });
      conn.ev.on("messages.upsert", async (m) => {
        if (m.type !== "notify") return;
        let msg = await serialize(
          JSON.parse(JSON.stringify(m.messages[0])),
          conn
        );
        await saveMessage(m.messages[0], msg.sender);
        if (config.AUTO_READ) await conn.readMessages(msg.key);
        if (config.AUTO_STATUS_READ && msg.from === "status@broadcast")
          await conn.readMessages(msg.key);

        let text_msg = msg.body;
        if (!msg) return;
        const regex = new RegExp(`${config.HANDLERS}( ?resume)`, "is");
        isResume = regex.test(text_msg);
        const chatId = msg.from;
        try {
          const pausedChats = await PausedChats.getPausedChats();
          if (
            pausedChats.some(
              (pausedChat) => pausedChat.chatId === chatId && !isResume
            )
          ) {
            return;
          }
        } catch (error) {
          console.error(error);
        }
        if (config.LOGS) {
          let name = await getName(msg.sender);
          console.log(
            `ɴᴇᴡ ᴍᴇssᴀғᴇ ɪɴ : ${
              msg.from.endsWith("@g.us")
                ? (await conn.groupMetadata(msg.from)).subject
                : msg.from
            }\nsᴇɴᴅᴇʀ : ${name}\nMessage:${text_msg ? text_msg : msg.type}`
          );
        }
        plugins.commands.map(async (command) => {
          if (command.fromMe && !msg.sudo) return;
          let comman = text_msg;
          msg.prefix = new RegExp(config.HANDLERS).test(text_msg) && text_msg 
    ? text_msg[0]?.toLowerCase() 
    : "!";
          let whats;
          switch (true) {
            case command.pattern && command.pattern.test(comman):
              let match;
              try {
                match = text_msg
                  .replace(new RegExp(command.pattern, "i"), "")
                  .trim();
              } catch {
                match = false;
              }
              whats = new Message(conn, msg);
              command.function(whats, match, msg, conn);
              break;
            case text_msg && command.on === "text":
              whats = new Message(conn, msg);
              command.function(whats, text_msg, msg, conn, m);
              break;
            case command.on === "image" || command.on === "photo":
              if (msg.type === "imageMessage") {
                whats = new Image(conn, msg);
                command.function(whats, text_msg, msg, conn, m);
              }
              break;
            case command.on === "sticker":
              if (msg.type === "stickerMessage") {
                whats = new Sticker(conn, msg);
                command.function(whats, msg, conn, m);
              }
              break;
            case command.on === "video":
              if (msg.type === "videoMessage") {
                whats = new Video(conn, msg);
                command.function(whats, msg, conn, m);
              }
              break;
            case command.on === "delete":
              if (msg.type === "protocolMessage") {
                whats = new Message(conn, msg);
                whats.messageId = msg.message.protocolMessage.key.id;
                command.function(whats, msg, conn, m);
              }
            case command.on === "message":
              whats = new AllMessage(conn, msg);
              command.function(whats, msg, conn, m);
              break;
            default:
              break;
          }
        });
      });


      return conn;
    } catch (error) {
      console.log(error);
    }
    return;
  };
try {
	await connectSession(config.SESSION_ID);
        connectToWhatsApp();
} catch (error) {
	console.log("Encountered Error", error)
}
};

module.exports = connect;
