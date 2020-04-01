'use strict';
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");
const https = require('https');

module.exports.handler = async (event) => {
    let params = event;
    console.log('UploadToXLedger: New task for ' + params.presetName + ': ' + params.filePath);
    
    console.log('UploadToXLedger: Getting config settings', params.presetName);
    const preset = await configProvider.getPreset(params.presetName);

    console.log('UploadToXLedger: Fetching file', params.filePath);
    const dataRes = (await s3.getObject({
        Bucket: process.env.DATA_BUCKET,
        Key: params.filePath
    }).promise()).Body;

    // extract entityCode from Order XML
    const ecRE = new RegExp('<OwnerKey>(.*)</OwnerKey>');
    const entityCode = dataRes.toString().match(ecRE)[1];
    if (entityCode !== undefined) {
        console.log('Extracted EntityCode from XML ', entityCode);
        const result = await upload(preset, dataRes, params.filePath.split('/').pop(), entityCode);
        return { error: result === null, message: result }
    } else {
        return { error: true, message: 'EntityCode not present in Order XML' }
    }

}

let upload = async (preset, data, filename, entityCode) => {

    const key = await readLogonKey(preset.name);
    const cert = await readCertificate(preset.name);
    const url = preset.xLedger.url + '/WS/Common/Lib/FileUpload.asmx';
    const agent = https.Agent({
        pfx: cert,
        passphrase: preset.xLedger.password
      });
    const payload = [
        '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
        '<soap12:Body>',
            '<ReceiveFile xmlns="http://ws.xledger.net/">',
            '<sUserName>' + preset.xLedger.username + '</sUserName>',
            '<sKey>' + key + '</sKey>',
            '<sApplication>'  + preset.xLedger.application + '</sApplication>',
            '<sFileName>lg11_' + filename + '</sFileName>',
            // Base64-encoded XML
            '<aFile>' + data.toString('base64') + '</aFile>',
            // some xLedger code
            '<sImportCode>LG11</sImportCode>',
            // Entity code for the restaurant:
            '<iEntityCode>' + entityCode + '</iEntityCode>',
            '</ReceiveFile>',
        '</soap12:Body>',
        '</soap12:Envelope>'
    ].join('');

    console.log('Sending to XLedger:', payload);

    axios.defaults.headers.post['Content-Type'] = 'application/soap+xml; charset=utf-8';
    return axios.post(url, payload, { httpsAgent: agent })
        .then(async (res) => {
            let re = new RegExp('<ReceiveFileResult>(.*)</ReceiveFileResult>');
            let r  = res.data.match(re);
            if (r) {
                console.log('UploadToXLedger: Got result!', r[1]);
                return r[1];
            }
            
            console.log('UploadToXLedger: Error parsing result!', res);
            return null;
        })
        .catch((err)=>{ console.log("UploadToXLedger: Server returned error ", err); return null; });
}


/**
 * Reads certificate file from S3
 * Returns null if file is not found
 * @param {*} presetName 
 */
const readCertificate = async (presetName) => {
    return s3.getObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'certificates/'+presetName+'.pfx'
    })
    .promise()
    .then((data) => {return data.Body})
    .catch(()=> {console.log('XLedgerAuth: Critical error. Certificate file not found'); return null});
}

/**
 * Reads logon key from S3
 * Returns null if file is not found
 * @param {*} presetName 
 */
const readLogonKey = async (presetName) => {
    return s3.getObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'xl-keys/' + presetName + '.key'
    })
    .promise()
    .then((data) => {return data.Body})
    .catch(()=> {console.log('XLedgerAuth: Critical error. LogonKey file not found'); return null});
}