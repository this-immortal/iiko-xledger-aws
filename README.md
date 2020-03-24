
# About

This is a simple serverless application for AWS platform. The app exports Purchase Orders from ```iiko restaurant management system``` to ```XLedger accounting system```.

The app is based on AWS Lambda technology and leverages AWS S3 for persistence. [Serverless platform](https://serverless.com)  is used for deployment. This app is a good example of hat can be built in just a matter of days using the AWS stack.

# How it works

The app consists of a few [AWS Lambda functions](https://aws.amazon.com/lambda/features/), each fulfilling one task. You can say it utilizes a micro-service architecture, where each service is a Lambda function.

## Workflow

The app works in a two-phase daily cycle.
The first phase is the preparation. During this stage a mapping table is built to match ordered items in iiko and those in XLedger.

The second phase is the export itself. The app would fetch the orders from ```iiko```, convert them to XLedger format and upload to ```XLedger```. Both the fetched files (json) and converted ones (xml) are stored in S3.

## Functions

- ```invoke_mapping_update``` – scheduled invocation of *update_product_mapping*
- ```invoke_export``` scheduled invocation of *fetch_orders_from_iiko*
- ```xl_auth``` scheduled authentication in xLedger
- ```update_product_mapping``` reads products and groups from iiko and stores a mapping table to S3
- ```read_product_mapping``` reads mapping table from S3
- ```fetch_orders_from_iiko``` fetches Purchase Orders from iiko and stores them to S3
- ```s3_watcher``` is triggered when a file is added to S3 and invoke converter and uploader fuctions
- ```convert_to_xml``` converts an iiko Purchase Order (json) to XLedger format (xml)
- ```xl_upload``` uploads xml to XLedger

## Configuration

The configuration is described in the export_config.json file, that must be present in the S3 bucket named ```xledger```. The json structure describes an array of *presets* each containing credentials for accessing iiko and xledger, as well as store-to-entity mapping. 

```json
{
    "presets": [
        {
            "name": "abc_restaurants", // no spaces allowed, just Aa..Zz_
            "iikoWeb": {
                "url": "https://abc_restaurants.iikoweb.co.uk", 
                "accountId": 125,
                "user": "integration",
                "password": "password"
            },

            "xLedger": {
                "url": "https://wsdemo.xledger.net",
                "username": "some@name.com",
                "password": "12347-pwd",
                "application": "XLEDGERDEMO"
            },
            "currencyCode": "GBP",
            "storeMapping": [
                {
                    "storeId": 1, // StoreConfigurationID (iiko)
                    "storeCode": "001", // the code of the Storage (!) in iiko
                    "restaurantCode": 101, // restaurant code in xLedger
                    "entityCode": 23001 // legal entity code in xLedger
                },
                {
                    "storeId": 2, 
                    "storeCode": "002",
                    "restaurantCode": 102,
                    "entityCode": 23002
                },
                {
                    "storeId": 3, 
                    "storeCode": "003",
                    "restaurantCode": 103,
                    "entityCode": 23003
                },
                {
                    "storeId": 4, 
                    "storeCode": "004",
                    "restaurantCode": 104,
                    "entityCode": 23004
                }
            ]
        },
        ...
    ]
}

```

# Installation and deployment

## Prepare AWS Stack

### WS account and user

There's a good article on [how to configure AWS](https://serverless.com/framework/docs/providers/aws/guide/quick-start/?gclid=CjwKCAjwvOHzBRBoEiwA48i6AjzieWR4DPcK5APaBiP_jrPj3R4jQWKH0bmpozSHyN97iSK5jkuSlRoC5zMQAvD_BwE) at Serverless website.


### Create two S3 buckets

- ```xledger``` - this is where all configuration stuff will be held
- ```xledger-uploads``` - this is where the app will upload fetched and converted files

## Prepare your local machine

To be able to deploy the app to AWS you will need to install node.js, npm (node package manager) and serverless framework.

### Install node / npm

Follow [**this guide**](https://nodejs.org/en/download/) to install Node.js on your machine.

### Install Serverless framework

Install serverless framework...

```bash
npm i serverless -g
```

...and provide your AWS credentials.

```bash
sls config credentials --provider aws --key YOUR_AWS_USER_KEY --secret YOUR_AWS_USER_SECRET
```

If stuck, see this [video instruction](https://www.youtube.com/watch?v=KngM5bfpttA)

### Clone the repo

Clone this repo to your machine and cd to the directory where you cloned it to.

## Deploy

Run the ```serverless deploy``` command

```bash
sls deploy
```

You should see something like this:

```bash
> aws-integration % sls deploy
Serverless: Packaging service...
Serverless: Excluding development dependencies...
Serverless: Installing dependencies for custom CloudFormation resources...
Serverless: Uploading CloudFormation file to S3...
Serverless: Uploading artifacts...
Serverless: Uploading service aws-integration.zip file to S3 (258.45 KB)...
Serverless: Uploading custom CloudFormation resources...
Serverless: Validating template...
Serverless: Updating Stack...
Serverless: Checking Stack update progress..........................
Serverless: Stack update finished...

Service Information
service: aws-integration
stage: dev
region: us-east-1
stack: aws-integration-dev
resources: 39
api keys:
  None
endpoints:
  None
functions:
  invoke_mapping_update: aws-integration-dev-invoke_mapping_update
  invoke_export: aws-integration-dev-invoke_export
  xl_auth: aws-integration-dev-xl_auth
  update_product_mapping: aws-integration-dev-update_product_mapping
  read_product_mapping: aws-integration-dev-read_product_mapping
  fetch_orders_from_iiko: aws-integration-dev-fetch_orders_from_iiko
  s3_watcher: aws-integration-dev-s3_watcher
  convert_to_xml: aws-integration-dev-convert_to_xml
  xl_upload: aws-integration-dev-xl_upload
layers:
  None
  
Serverless: Removing old service artifacts from S3...
Serverless: Run the "serverless" command to setup monitoring, troubleshooting and testing.
```

## Upload configuration files

Create export_config.json and upload it to ```S3:xledger```.
Obtain the access certificates from xLedger and upload them to ```S3:xledger/certificates```. The files must be named exactly the same as the *presets* in ```export_config.json```, and have the ```.pfx``` extension.

## Test it out

To test if your deployment worked, you can run a few functions.

### Prepare mapping

```bash
sls invoke -f invoke_mapping_update  --log  
```

Check if mapping files were added to ```S3:xledger/mapping``` folder.

### Get XLedger Logon Key

```bash
sls invoke -f xl_auth --log
```

Check if a mapping was added to ```S3:xledger/xl-keys``` folder.

### Fetch some orders

```bash
sls invoke -f fetch_orders_from_iiko -d '{"preset":"ONE_OF_YOUR_PRESETS","period":{"dateFrom":"2020-03-16","dateTo":"2020-03-16"}}' --log
```

Check if json files appeared in ```S3:xledger-uploads/ONE_OF_YOUR_PRESETS```
