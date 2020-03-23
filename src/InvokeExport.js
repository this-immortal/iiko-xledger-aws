'use strict';
const AWS = require('aws-sdk');
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const lambda = new AWS.Lambda();

module.exports.handler = async (event) => {
    console.log('InvokeExport: Invoking export');
    let cfg = await configProvider.getConfig();
    let dateTo = makeYesterdayDateString();
    let dateFrom = makeYesterdayDateString();

    if (event.dateFrom !== undefined) {
        dateFrom = event.dateFrom;
        dateTo = event.dateFrom;
    }

    if (event.dateTo !== undefined) {
        dateTo = event.dateTo;
    }

    const promises = cfg.presets
        .filter(x => event.preset === undefined || event.preset === x.name )
        .map(preset => { 
            return invokeOrderFetcher(
                { 
                    preset: preset.name, 
                    period: {
                        dateFrom: dateFrom, 
                        dateTo: dateTo 
                    }
                }) 
        });

    await Promise.all(promises);

    return { message: 'all done' }
}

/**
 * Invoke Lambda-functions that fetch files
 * @param {*} preset 
 */
const invokeOrderFetcher = async (parameters) => {
    console.log('InvokeExport: Invoking fetcher', process.env.F_FETCH_ORDERS, parameters);
    const params = {
        FunctionName: process.env.F_FETCH_ORDERS,
        InvocationType: "RequestResponse",
        LogType: 'Tail',
        Payload: JSON.stringify(parameters)
      };
  
      return lambda.invoke(params).promise();
};

/**
 * 
 */
const makeYesterdayDateString = () => {
    let d = new Date();
    d.setDate(d.getDate() - 1); // Yesterday!
    let
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}