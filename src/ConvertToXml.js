'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const lambda = new AWS.Lambda();


module.exports.handler = async (event) => {

    let params = event;
    console.log('ConvertToXML: New task for ' + params.presetName + ': ' + params.filePath);
    
    console.log('ConvertToXML: Getting config settings', params.presetName);
    const preset = await configProvider.getPreset(params.presetName);

    console.log('ConvertToXML: Fetching file', params.filePath);
    const s3Res = await s3.getObject({
        Bucket: process.env.DATA_BUCKET,
        Key: params.filePath
    }).promise();
    
    const order = JSON.parse(s3Res.Body);
    // trying to find a store by storage code
    console.log('ConvertToXML: Loading the store by code', order.shipment.storage.code);
    const store = preset.storeMapping.filter(x => x.storeCode === order.shipment.storage.code)[0];
    if (store === undefined) {
        return { error: true, message: 'ConvertToXML: Store with code not found: ' + order.shipment.storage.code }
    }

    console.log('ConvertToXML: getting product mapping');
    const options = {
        FunctionName: process.env.F_READ_MAPPING,
        InvocationType: "RequestResponse",
        LogType: 'Tail',
        Payload: JSON.stringify(preset.name)
    }
    const lambdaRes = await lambda.invoke(options).promise();
    const mapping = JSON.parse(lambdaRes.Payload);
    if (mapping === undefined || mapping.error ) {
        return { error: true, message: 'Fetching mapping failed'}
    }

    console.log('ConvertToXML: Starting conversion to Xledger format');
    let result = await createPOFile(convertOrderToXLedgerFormat(order, store, mapping.data), preset.name)

    return { error: false, message: 'All done'}
}

/**
 * Creates invoice json file and puts it to S3
 * @param {*} invoice 
 */
let createPOFile = async (data, presetName) => {
    const filename = data.header.ExtOrder+'.xml';
    const date = data.header.DeliveredDate;
    const key = presetName + '/xml/' + date + '/' + filename;
    console.log('ConvertToXML: saving xml to s3 --->', key);
    return s3.putObject({
            Bucket: process.env.DATA_BUCKET,
            Key: key,
            Body: objectToXml(data),
        }).promise();
}

 /**
  * Converts iiko Order to a JSON prepared for XML conversion  
  * @param {*} iikoOrder 
  * @param {*} store 
  * @param {*} productMappinng 
  */
const convertOrderToXLedgerFormat = (iikoOrder, store, productMappinng) => {

    console.log('ConvertToXML: converting order to XLedger format');

    let orderHeader = {
        OwnerKey: store.entityCode,
        OrderDate: new Date(iikoOrder.createdAt.date).toISOString('en-GB', { timeZone: 'UTC' }).split('T').join(' ').substring(0,19), // format: 2020-03-10 13:01:22 
        SubledgerCode: iikoOrder.shipment.supplier.code,
        CurrencyCode: 'GBP',
        ExtOrder: iikoOrder.draftNumber,
        GLObject1: 'Cost center',
        GLObjectValue1Code: store.restaurantCode,
        DeliveredDate: new Date(iikoOrder.shipment.date * 1000).toISOString().substring(0, 10), // format: 2020-03-01 
        GoodsReceipt: 'true'
    };

    // XML format sucks when arrays are involved!
    let orerDetails = iikoOrder.shipment.items.map((x, i) => { 
        const pid = x.internalProduct.internalProductId;
        const groupInfo = productMappinng[pid];
        let groupName = 'UNDEFINED';
        if (groupInfo !== undefined && groupInfo !== null) {
            groupName = groupInfo.group;
        } 
        return {
            LineNo: x.num,
            ProductCode: groupName,
            Text: [x.supplierProduct.code, x.supplierProduct.name, x.container.name].join(', '),
            UnitKey: 3483,
            Quantity: x.receivedQuantity,
            UnitPrice: x.priceWithoutVat,
            TaxRule: x.vatPercent === 0 ? 'ZI' : 'SIN'        
        } 

    });

    return {header: orderHeader, details: orerDetails};
}


/**
 * Creates an XML from PO
 * @param {*} obj 
 */
const objectToXml = (obj) => {
    console.log('ConvertToXML: creating XML');
    const start = ['<PurchaseOrders>\n   <PurchaseOrder>'];
    const h = Object.keys(obj.header).map(x => ['      <', x, '>', obj.header[x], '</', x, '>'].join('')).join('\n');
    const details = obj.details.map(
        item => [
            '      <PurchaseOrderDetails>', 
            Object.keys(item).map(x => ['         <',x,'>',item[x],'</',x,'>'].join('')).join('\n'), 
            '      </PurchaseOrderDetails>'
        ].join('\n')
    ).join('\n');
    const end = ['   </PurchaseOrder>\n</PurchaseOrders>']
    return [start, h, details, end].join('\n');
}

