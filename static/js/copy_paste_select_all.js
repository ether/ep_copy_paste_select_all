exports.postAceInit = function(hook, context){
  $('#selectAll').click(function(){
    context.ace.callWithAce(function(ace){
      var document = ace.ace_getDocument();

      var numberOfLines=$(document).find("body").contents().length;
      var lastLineLenght = 8;
      ace.ace_performSelectionChange([0,0], [numberOfLines-1,0], false);
    },'selectAll' , true);
  });

  $('#findAndReplace').click(function(){
    var from = prompt("Search for...");
    var to = prompt("Replace with...");
    var HTMLLines = $('iframe[name="ace_outer"]').contents().find('iframe').contents().find("#innerdocbody").children("div");
    $(HTMLLines).each(function(){ // For each line
      findAndReplace(from, to, this);
    });
  });
}

function findAndReplace(searchText, replacement, searchNode) {
  if (!searchText || typeof replacement === 'undefined') {
    // Throw error here if you want...
    return;
  }
  var regex = typeof searchText === 'string' ?
    new RegExp(searchText, 'gi') : searchText,
    childNodes = (searchNode || document.body).childNodes,
    cnLength = childNodes.length,
    excludes = ["html","head","style","title","meta","script","object","iframe","link"];

  while (cnLength--) {
    var currentNode = childNodes[cnLength];
    if (currentNode.nodeType === 1){
      if(excludes.indexOf(currentNode.nodeName.toLowerCase() === -1)){
        arguments.callee(searchText, replacement, currentNode);
      }
    }
    if (currentNode.nodeType !== 3 || !regex.test(currentNode.data) ) {
      continue;
    }
    var parent = currentNode.parentNode,
    frag = (function(){
      var html = currentNode.data.replace(regex, replacement),
      wrap = document.createElement('div'),
      frag = document.createDocumentFragment();
      wrap.innerHTML = html;
      while (wrap.firstChild) {
        frag.appendChild(wrap.firstChild);
      }
      return frag;
    })();
    parent.insertBefore(frag, currentNode);
    parent.removeChild(currentNode);
  }
}
