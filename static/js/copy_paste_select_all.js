exports.postAceInit = function(hook, context){
  $('#selectAll').click(function(){
    context.ace.callWithAce(function(ace){
      var document = ace.ace_getDocument();

      var numberOfLines=$(document).find("body").contents().length;
      var lastLineLenght = 8;
      ace.ace_performSelectionChange([0,0], [numberOfLines-1,0], false);
    },'selectAll' , true);
  });
}
