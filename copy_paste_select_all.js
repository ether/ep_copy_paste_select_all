'use strict';

const eejs = require('ep_etherpad-lite/node/eejs/');

exports.eejsBlock_dd_edit = (hookName, args, cb) => {
  args.content += eejs.require('ep_copy_paste_select_all/templates/copy_paste_select_all_menu.ejs');
  cb();
};
