'use strict';
let ConfigProvider = require('../config');
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");

/**
 * Fetches product mapping
 * @param {string} event - must contain the name of the preset to fetch mapping for
 */
module.exports.handler = async (event) => {

    console.log('UpdateProductMapping: got called with params', event)
    let presetName = event;
    console.log('UpdateProductMapping: reading config preset', presetName);
    let preset = await configProvider.getPreset(presetName);
    if (preset === null) {
        return {
            error: true,
            message: 'Preset (' + presetName + ') not found in config!'
        }
    }
    // fetch and build mapping 
    console.log('UpdateProductMapping: trying to fetch data from iiko');
    let mapping = await createMapping(preset);

    if (mapping) {
        let res = await storeMapping(preset.name, mapping);
        return {
            error: false,
            message: 'UpdateProductMapping: Product Mapping Table created: ',
            data: mapping
        }
    } else {
        return {
            error: true,
            message: 'UpdateProductMapping: Failed to create Product Mapping Table!'
        }
    }

}

/**
 * Stores Mapping File to S3
 * @param {*} presetName 
 * @param {*} mappingData 
 */
const storeMapping = async (presetName, mappingData) => {
    console.log('UpdateProductMapping: Saving mapping to S3 ');
    return s3.putObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'mapping/' + presetName + '/product_groups.json',
        Body: JSON.stringify(mappingData),
    }).promise();
}


/**
 * Fetches products and groups from iiko and returns a mapping table
 * @param {*} preset 
 */
const createMapping = async (preset) => {

    const url = preset.iikoWeb.url;
    console.log('UpdateProductMapping: Authenticating at ', url);
    const options = {
        headers: {
            'Content-Type': 'application/json'
        },
        withCredentials: true
    }

    try {

        // Authenticating in iiko
        const response = await axios.post(url + '/api/auth/login', {
            login: preset.iikoWeb.user,
            password: preset.iikoWeb.password
        }, options);
        console.log('UpdateProductMapping: logged in as ' + response.data.user.name);
        console.log('UpdateProductMapping: got cookies', response.headers["set-cookie"]);
        const cookie = response.headers["set-cookie"][0]; // get cookie from request
        //axios.defaults.headers.Cookie = cookie;
        options.headers.Cookie = cookie;

        // Fetching Products and Product Groups
        const mapping = axios.get(url + '/api/inventory/purchasing/export/product_groups', options).then(
            // request succeeded
            (res) => {
                if (!res.data.error) {
                    let products = res.data.data;
                    let mapping = {}
                    console.log('UpdateProductMapping: fetched ' + Object.keys(products).length + ' products')
                    for (let id in products) {
                        if (products.hasOwnProperty(id)) {
                            mapping[id] = {
                                product: products[id].name,
                                group: (products[id].group !== null && products[id].group !== undefined) ? products[id].group.name : 'UNDEFINED'
                            }
                        }
                    }

                    return mapping;

                } else {
                    console.log('UpdateProductMapping: error fetching product groups');
                    return null;
                }
            },
            // request rejected
            (res) => {
                console.log('UpdateProductMapping: request to iiko failed', res);
                console.log('UpdateProductMapping: error fetching product groups');
                return null;
            }
        );

        // logging out
        await axios.get(preset.iikoWeb.url+'/api/auth/logout', options);

        return mapping;

    } catch (error) {
        console.log(error);
        return null;
    }
}