const fs = require("fs");
const fsp = require('fs').promises;
const path = require("path");
const axios = require("axios");
const fetch = require("node-fetch");
const ffmpeg = require('fluent-ffmpeg');
const FormData = require('form-data');
const { fromBuffer } = require("file-type");
const fileTypeFromBuffer = () => import('file-type').then(({ fileTypeFromBuffer }) => fileTypeFromBuffer);

// Function to send a POST request with JSON data
exports.postJson = async (url, postData, options = {}) => {
  try {
    const response = await axios.request({
      url: url,
      data: JSON.stringify(postData),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });
    return response.data;
  } catch (error) {
    return error;
  }
};

// Function to format time (in seconds) to a readable string (days, hours, minutes, seconds)
exports.formatTime = function (seconds) {
  seconds = Number(seconds);
  
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const dDisplay = d > 0 ? `${d}${d === 1 ? " day, " : " days, "}` : "";
  const hDisplay = h > 0 ? `${h}${h === 1 ? " hour, " : " hours, "}` : "";
  const mDisplay = m > 0 ? `${m}${m === 1 ? " minute, " : " minutes, "}` : "";
  const sDisplay = s > 0 ? `${s}${s === 1 ? " second" : " seconds"}` : "";
  
  return dDisplay + hDisplay + mDisplay + sDisplay;
};

// Convert number to JID format for WhatsApp
exports.numToJid = (num) => `${num}@s.whatsapp.net`;

// Parse and return JIDs from a given text
exports.parsedJid = (text = '') => {
  return [...text.match(/[0-9]+(-[0-9]+|)(@g.us|@s.whatsapp.net)/g)];
};
