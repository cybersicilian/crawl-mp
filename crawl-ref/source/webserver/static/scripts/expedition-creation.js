/* A creation-form choice. Existing expedition presentation remains server-owned. */
define([],function(){
    "use strict";
    function value(control){
        var checked=control&&control.querySelector("input:checked");
        return checked&&checked.value==="first_person"?"first_person":"overhead";
    }
    function set(control,mode){
        control.querySelectorAll("input").forEach(function(input){input.checked=input.value===(mode==="first_person"?mode:"overhead");});
    }
    function choice(id,label){
        var group=document.createElement("fieldset");group.id=id;group.className="expedition-view-choice";
        var legend=document.createElement("legend");legend.textContent=label;group.appendChild(legend);
        [["overhead","2D","Overhead view"],["first_person","3D","First-person view"]].forEach(function(item){
            var option=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span");
            input.type="radio";input.name=id;input.value=item[0];input.setAttribute("aria-label",item[2]);
            text.textContent=item[1];option.append(input,text);group.appendChild(option);
        });
        set(group,"overhead");return group;
    }
    function current(){return value(document.getElementById("lobby_creation_presentation"));}
    return {choice:choice,set:set,value:value,current:current};
});
