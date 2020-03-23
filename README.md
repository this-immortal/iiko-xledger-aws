aws-integration
Export Purchase Orders from iiko to XLedger accounting system

#Installation and deployment

1) Install node / npm
2) Install Serverless framework globally (npm i serverless -g). You will need to provide your AWS credentials. 
3) Clone repo and cd to the directory with serverless
4) Run "sls deploy" to upload the files
5) Set up your AWS account: create 2 S3 buckets "xledger" and "xledger-uploads"
6) Create export_config.json using the provided template and upload it to "xledger" bucket
7) Upload a PFX-certificate for each preset in export_config.json to "xledger/certificates/<preset_name>.pfx"

Wait until next morning.
