'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const CSV = require('csv-parser');
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();

module.exports.convert = async (event) => {

    const preset = configProvider.getPreset(event.preset)
    const olapData = await parseCsv(event.fileName)
    let xml = null;

    switch (event.report) {
        case 'OLAP_PRODUCTS': 
            xml = convertProductReport(olapData, preset)
        break;
        case 'OLAP_PAYMENTS': 
            xml = convertPaymentReport(olapData, preset)
        break;

        default: 
            console.log("ReportToXml: Unknown report type", event)
            throw "ReportToXml: Unknown report type";
    }

    
    event.xml = putFile(xml, event.preset, event.storeCode, event.dateFrom, event.dateTo, event.report.toLowerCase())

    return event;
}

const convertProductReport = (reportData, preset) => {

    

}

const convertPaymentReport = (reportData, preset) => {

}

const parseCsv = async (key) => {
    return s3.getObject({
        Bucket: process.env.DATA_BUCKET,
        Key: key
    }).createReadStream()
    .pipe(CSV({ headers: true }))
    .on('data', (data) => results.push(data))
    .on('end', () => {
        console.log(results)
    });
}

const putFile = async (data, presetName, store, dateFrom, dateTo, report) => {
    const date = (new Date()).toISOString().substring(0,9);
    const key = presetName + '/sales/' + date + '/' + store + '_' + dateFrom + '-' + dateTo + '_' + report + '.xml';
    console.log('ConvertToXML: saving xml to s3 --->', key);
    await s3.putObject({
            Bucket: process.env.DATA_BUCKET,
            Key: key,
            Body: objectToXml(data),
        }).promise();    
    
    return key;
}