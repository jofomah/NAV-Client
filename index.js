var PouchDB = require('pouchdb');
var async = require('async');
var httpreq = require('httpreq');
var ntlm = require('httpntlm').ntlm;
var Agent = require('agentkeepalive');
var keepaliveAgent = new Agent();


var url = 'http://182.18.161.63/NAVXMLService/';
var stockCountDBUrl = 'https://lomis.ehealth.org.ng:5984/stockcount';
var db = new PouchDB(stockCountDBUrl);
var options = {
  live: true,
  since: 'now',
  include_docs: true
};
var ntlmOptions = {
  url: url,
  username: 'eHealth',
  password: 'wbRUwau7',
  workstation: '',
  domain: 'hydentbkp.ctrlscloud.com'
};

db.changes(options)
  .on('change',function(change) {
    var stockCount = change.doc;
    var stockCounts = parseStockCount(stockCount);
    if (stockCounts.length && stockCounts.length > 0) {
      var reqBody = toXml(stockCounts);
      postMsg(ntlmOptions, reqBody);
    }
  }).on('error', function(err) {
    console.log('Error: ' + err);
  });

var postMsg = function(opts, reqBody) {
  async.waterfall([
    function($) {
      var type1msg = ntlm.createType1Message(opts);
      httpreq.post(opts.url, {
        body: reqBody,
        headers: {
          'Content-Type': 'text/xml',
          'Connection': 'keep-alive',
          'Authorization': type1msg
        },
        agent: keepaliveAgent
      }, $);
    },
    function(res, $) {
      if (!res.headers['www-authenticate'])
        return $(new Error('www-authenticate not found on response of second request'));
      var type2msg = ntlm.parseType2Message(res.headers['www-authenticate']);
      var type3msg = ntlm.createType3Message(type2msg, opts);
      httpreq.post(opts.url, {
        body: reqBody,
        headers: {
          'Content-Type': 'text/xml',
          'Connection': 'keep-alive',
          'Authorization': type3msg
        },
        allowRedirects: false,
        agent: keepaliveAgent
      }, $);
    }
  ], processResult);
};

var processResult = function(err, res) {
  if (err) {
    return console.log(err);
  }
  console.error(res);
};

var parseStockCount = function(stockCount) {
  var stockCounts = [];
  var sc, count;
  var facilityID = stockCount.facility;
  for (var uuid in stockCount.unopened) {
    count = stockCount.unopened[uuid];
    sc = {
      FacilityID: facilityID,
      ProductID: uuid,
      StockCountDate: stockCount.countDate,
      StockCountNo: count
    }
    stockCounts.push(sc)
  }
  return stockCounts;
};

var stockCountToXml = function(stockCount) {
  var msg = [
    '<StockCount>',
    '<FacilityID>' + stockCount.FacilityID + '</FacilityID>',
    '<ProductID>' + stockCount.ProductID + '</ProductID>',
    '<StockCountDate>' + stockCount.StockCountDate + '</StockCountDate>',
    '<StockCountNo>' + stockCount.StockCountNo + '</StockCountNo>',
    '</StockCount>'
  ].join('');
  return msg;
};

var toXml = function(stockCounts) {
  var stockCount;
  var header = '<?xml version="1.0" encoding="UTF-8"?>';
  header += '<ArrayOfStockCount xmlns="http://schemas.datacontract.org/2004/07/NAVServiceWeb">';
  var footer = '</ArrayOfStockCount>';
  var body = '';
  for (var i in stockCounts) {
    stockCount = stockCounts[i];
    body += stockCountToXml(stockCount);
  }
  var xml = [
    header,
    body,
    footer
  ].join('');
  return xml;
};