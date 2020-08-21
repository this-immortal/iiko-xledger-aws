'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const stepfunctions = new AWS.StepFunctions()
const axios = require("axios");


module.exports.invoke = async (event) => {

    console.log("FetchSales: Invoke step function", event);
    const config = await configProvider.getConfig();

    const presets = event.presets === undefined ? config.presets.map(p => p.name) : event.presets;

    if (event.dateFrom === undefined) {
        let today = new Date();
        event.dateFrom = makeDateYmd(today.setDate(today.getDate()-1))
    } 

    if (event.dateTo === undefined) {
        event.dateTo = event.dateFrom;
    } 

    // Invoke a step function for every preset
    // Step function will start with iikoAuth.login
    let stepFunctionPromises = []
    let params = {
      stateMachineArn: process.env.SM_OLAP_FETCHER
    }     

    for (let i = 0; i < presets.length; i++) {
        event.preset = presets[i];
        params.input = JSON.stringify(event);
        console.log("FetchSales: Invoking OLAP fetcher for " + event.preset + " :", params)        
        stepFunctionPromises.push(stepfunctions.startExecution(params).promise())       
    }

    await Promise.all(stepFunctionPromises);
    console.log("FetchSales: Invoked OLAP fetcher for " + presets.length + " presets");

    return { error: false }
}

/**
 * Defines the list of reports (codes) and provides iteration
 */
module.exports.selectReport = async (event) => {

    console.log("FetchSales: select report", event)

    if (event.reports === undefined || event.reports.length === 0) {
        event.reports = ["OLAP_PRODUCTS", "OLAP_PAYMENTS"]
    }

    event.report = event.reports.pop()
    event.isLastReport = event.reports.length === 0;

    return event;
}


/**
 * Initiates OLAP fetch
 */
module.exports.init = async (event) => {

    console.log("FetchSales: Init called", event);
    axios.defaults.headers.Cookie = event.cookie;
    const requestBody = makePayload(event.report, event.storeId, event.dateFrom, event.dateTo);
    const response = await axios.post(event.server+'/api/olap/init', requestBody, {headers: {'Content-Type':'application/json', Cookie: event.cookie}});
    if (response.status !== 200 || response.data.error !== false) {
        console.log("FetchSales: iikoServer error!", response);
        throw "FetchSales: iikoServer error!"
    }
    event.key = response.data.data;
    event.index = 1;
    return event;
}

/**
 * Checks if the report is ready
 */
module.exports.checkStatus = async (event) => {
    console.log("FetchSales: CheckStatus called ", event);
    console.log("FetchSales: Checking status for key: " + event.key + "Attempt " + event.index)

    //const requestBody = makePaymentReportPayload(event.report, event.storeId, event.dateFrom, event.dateTo);
    const response = await axios.get(event.server+'/api/olap/fetch-status/'+event.key, {headers: {'Content-Type':'application/json', Cookie: event.cookie}});

    if (response.status !== 200 || response.data.error !== false || response.data.data === "ERROR") {
        console.log("FetchSales: iikoServer error!", response);
        throw "FetchSales: iikoServer error!"
    }

    event.index += 1;
    event.result = response.data.data === "SUCCESS";

    return event;
}


/**
 * Fetches report data
 */
module.exports.fetchData = async (event) => {
    console.log("FetchData called ", event);

    const requestBody = makePayload(event.report, event.storeId, event.dateFrom, event.dateTo);
    const response = await axios.post(event.server+'/api/olap/fetch/'+event.key + '/csv', requestBody, {headers: {'Content-Type':'application/json', Cookie: event.cookie}});

    if (response.status !== 200) {
        console.log("FetchSales: iikoServer error!", response);
        throw "FetchSales: iikoServer error!"
    }

    createSalesFile(response.data, event.preset, event.storeCode, event.dateFrom, event.dateTo, event.report);

    // cleaning up event
    event.key === undefined;
    
    return event;

}


let makePayload = (reportCode, storeId, dateFrom, dateTo) => {
    switch (reportCode) {
        case "OLAP_PRODUCTS": return makeProductReportPayload(storeId, dateFrom, dateTo)
        case "OLAP_PAYMENTS": return makePaymentReportPayload(storeId, dateFrom, dateTo)
    }
}

let makeProductReportPayload = (storeId, dateFrom, dateTo) => {
    return {
        "storeIds": [storeId],
        "olapType": "SALES",
        "categoryFields": [],
        "groupFields": [
          "Department.Code",
          "PayTypes"
        ],
        "stackByDataFields": false,
        "dataFields": [
          "Sales"
        ],
        "calculatedFields": [
          {
            "name": "Sales",
            "title": "Sales",
            "description": "Net sales",
            "formula": "[DishDiscountSumInt.withoutVAT]",
            "type": "MONEY",
            "canSum": false
          }
        ],
        "filters": [
          {
            "field": "OpenDate.Typed",
            "filterType": "date_range",
            "dateFrom": dateFrom,
            "dateTo": dateTo
          },
          {
            "field": "NonCashPaymentType",
            "filterType": "value_list",
            "valueList": [null]
          }
        ]
      }
}


let makePaymentReportPayload = (storeId, dateFrom, dateTo) => {
    return {
        "storeIds": [storeId],
        "olapType": "SALES",
        "categoryFields": [],
        "groupFields": [
          "Department.Code",
          "PayTypes"
        ],
        "stackByDataFields": false,
        "dataFields": [
          "Sales"
        ],
        "calculatedFields": [
          {
            "name": "Sales",
            "title": "Sales",
            "description": "Net sales",
            "formula": "[DishDiscountSumInt.withoutVAT]",
            "type": "MONEY",
            "canSum": false
          }
        ],
        "filters": [
          {
            "field": "OpenDate.Typed",
            "filterType": "date_range",
            "dateFrom": dateFrom,
            "dateTo": dateTo
          },
          {
            "field": "NonCashPaymentType",
            "filterType": "value_list",
            "valueList": [null]
          }
        ]
      }
}



let makeDateYmd = (date) => {
    let d = new Date(date);
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
}


/**
 * Creates invoice json file and puts it to S3
 * @param {*} invoice 
 */
let createSalesFile = async (data, presetName, storeCode, dateFrom, dateTo, reportCode) => {
    const key = presetName + '/sales/' + reportCode + '/' + reportCode + '-' + storeCode + '—' + dateFrom + '—' + dateTo + '.csv';
    console.log('FetchSales: saving file --->', key);
    await s3.putObject({
            Bucket: process.env.DATA_BUCKET,
            Key: key,
            Body: data,
        }).promise();
    
    return key;
}