
  	var toggle_img = function(){
		var a = $(this).attr('src');
		var b = $(this).attr('alt');
	
		$(this).attr('alt',a);
		$(this).attr('src',b);
	};
	var handler_tr = function(){
		$(this).slideToggle("slow");
	};
 	var handler01 = function(){
		toggle_img.call($(this).children('img'));
		$('.tdata_tr01').each(function() {handler_tr.call($(this));});
	};
 	var handler02 = function(){
		toggle_img.call($(this).children('img'));
		$('.tdata_tr02').each(function() {handler_tr.call($(this));});
	};
 	var handler03 = function(){
		toggle_img.call($(this).children('img'));
		$('.tdata_tr03').each(function() {handler_tr.call($(this));});
	};
 	var handler04 = function(){
		toggle_img.call($(this).children('img'));
		$('.tdata_tr04').each(function() {handler_tr.call($(this));});
	};
 	var handler05 = function(){
		toggle_img.call($(this).children('img'));
		$('.tdata_tr05').each(function() {handler_tr.call($(this));});
	};
	
	$(document).ready(function(){
		$('.handler01').click(handler01);
	});
	$(document).ready(function(){
		$('.handler02').click(handler02);
	});
	$(document).ready(function(){
		$('.handler03').click(handler03);
	});
	$(document).ready(function(){
		$('.handler04').click(handler04);
	});
	$(document).ready(function(){
		$('.handler05').click(handler05);
	});
