'use strict';
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");

module.exports.handler = async (event) => {
    
    console.log(event);
    // get config preset
    const params = event;//JSON.parse(event);
    // we expect that config preset name is sent within event.Payload
    const presetName = params.preset;
    const preset = await configProvider.getPreset(presetName);
    // we expect that desired period is sent within event.Payload
    // { dateFrom: '2020-03-01', dateTo: '2020-03-01'}
    const period = params.period;

    // Authenticating in iiko
    const options = {
        headers: {'Content-Type':'application/json'},
        withCredentials: true
      }

    let cookie = null;  
    let attempts = 0;
    let response = null;
    while (cookie === null && attempts < 10) {
        console.log('FetchOrdersFromIiko: Authentication attempt ' + (attempts+1));
        response = await axios.post(preset.iikoWeb.url+'/api/auth/login', { login: preset.iikoWeb.user, password: preset.iikoWeb.password }, options);
        if (response.headers["set-cookie"] !== undefined) {
            cookie = response.headers["set-cookie"][0]; // get cookie from request
        } else {
            console.log(response.headers);
        }
        attempts++;
    }

    console.log('FetchOrdersFromIiko: logged in as ' + response.data.user.name);

    if (cookie === null) {
        return { error: true, message: 'Could not get session cookie '}
    }

    axios.defaults.headers.Cookie = cookie;
    let orders = 0;

    const fetchOrdersResponse = await axios.post(preset.iikoWeb.url+'/api/inventory/purchasing/export/orders', period, options);
    // logging out
    await axios.get(preset.iikoWeb.url+'/api/auth/logout', options);

    if (!fetchOrdersResponse.data.error) {
        let orders = fetchOrdersResponse.data.data;
        console.log('FetchOrdersFromIiko: fetched ' + fetchOrdersResponse.data.data.length + ' purchase orders');
        console.log('FetchOrdersFromIiko: Storing files to S3 bucket', process.env.DATA_BUCKET);
        let promises = orders.map(order => createInvoiceFile(order, preset.name));
        const result = await Promise.all(promises);
        orders = result.length;
        console.log('FetchOrdersFromIiko: All done. Exported ' + result.length + ' files.');

    } else {
        console.log('FetchOrdersFromIiko: error fetching orders', fetchOrdersResponse.data);
        return { error: true, message: 'Order fetching failed', orders: 0}

    }

    return { error: false, message: 'Done fetching', orders: orders}
}

/**
 * Creates invoice json file and puts it to S3
 * @param {*} invoice 
 */
let createInvoiceFile = async (invoice, presetName) => {
    const filename = invoice.draftNumber+'.json';
    const date = (new Date(invoice.shipment.date * 1000)).toISOString().substring(0,10);
    const key = presetName + '/uploads/' + date + '/' + filename;
    console.log('FetchOrdersFromIiko: --->', key);
    return s3.putObject({
            Bucket: process.env.DATA_BUCKET,
            Key: key,
            Body: JSON.stringify(invoice),
        }).promise();
}