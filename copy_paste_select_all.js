var eejs = require('ep_etherpad-lite/node/eejs/');
var settings = require('ep_etherpad-lite/node/utils/Settings');
var checked_state = '';

exports.eejsBlock_dd_edit = function (hook_name, args, cb) {
  args.content = args.content + eejs.require('ep_copy_paste_select_all/templates/copy_paste_select_all_menu.ejs');
  return cb();
}

