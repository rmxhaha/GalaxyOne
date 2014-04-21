/**
 *  Global 
 *  -> FLAG : add modernizr check feature needed
 */

var socket = io.connect('http://localhost/');	


function _extend( x, y ){
	for (var key in y) {
		if (y.hasOwnProperty(key)) {
			x[key] = y[key];
		}
	}
	return x;
	
}

/** Chat Room
 *  UI Improvement : 
 *   -> message disappear after certain amount of time
 *   -> Chat Input only appear when enter is pressed then disappear again after message has been sent
 */
//socket.emit( 'identification', prompt('Your Name : ') );
socket.emit( 'identification', "Test Subject" );
socket.on('identification', function( idnum ){
	
});

function appendMessage( from, message ){
	var newDiv = document.createElement("div");
	newDiv.innerHTML = '<div class=chat-message><b>' + from + "</b> : " + message + "</div>";
	var chatbox = document.getElementById("chat-container");
	chatbox.insertBefore(newDiv,chatbox.lastChild);
	chatbox.scrollTop = chatbox.scrollHeight;
}

socket.on('broadcast' ,function( data ){
	appendMessage( data.sender, data.message );
});

var chatinput = document.getElementById('chat-input');

chatinput.onkeypress = function(e){
	if( e.keyCode == 13 ){
		if( chatinput.value != '' ){
			socket.emit('message', chatinput.value );
			chatinput.value = '';
		}
	}
};


/** GalaxyOne Space battle
 *  Work :
 *   -> Interpolation
 */
var gRadiusOn = false;
 
var canvas = document.getElementById("canvas");
var context = canvas.getContext("2d");

window.onresize = function( e ){
	debugcanvas.width = canvas.width = window.innerWidth;
	debugcanvas.height = canvas.height = window.innerHeight;
}

var mx = 0;
var my = 0;

var camx = 0;
var camy = 0;

window.onmousemove = function (e) {
	mx = e.pageX;
	my = e.pageY;
}

window.onkeypress = function (e) {
	if (e.keyCode == 32) {
		gRadiusOn = true;
	}
	else if( e.keyCode == 13 ){
		if( chatinput.style.display == "none" ) {
			chatinput.style.display = "block";
			chatinput.focus();
		} else 
			chatinput.style.display = "none";
	}
}

window.onkeyup = function(e){
	if (e.keyCode == 32) {
		gRadiusOn = false;
	}
}

var cdata = {
	units : [],
	heads : []
};


socket.on('legion', function( data ){
	cdata = data;
});



var spaceshipImage = new Image();
spaceshipImage.src = "/images/Models_M001_1.png";

function drawShip( options ) {
	var _default = {
		x : 0,
		y : 0,
		angle : 0,
		size : 100,
		type : 0,
		legion : 0
	};
	
	var setup = _extend( _default, options );
	
	for( var i in setup ){
		if( setup.hasOwnProperty( i ) && i != 'angle' ){
			setup[i] = Math.floor( setup[i] );
		}
	}

	context.save();
	context.translate(setup.x, setup.y);
	context.rotate( setup.angle);
	context.drawImage(
		spaceshipImage, 
		setup.type * 100, 
		setup.legion * 100, 
		100, 100, 
		
		-setup.size/2, 
		-setup.size/2, 
		setup.size, setup.size
		);
	context.restore();
}

function angle( entity ){
	return Math.atan2( entity.vx, -entity.vy );
}

var Time = function () {
	this.time = new Date();
	this.reset = function () {
		var out = this.getElapsedTime();
		this.time = new Date();

		return out;
	}

	this.getElapsedTime = function () {
		return new Date() - this.time;
	}

	this.reset();
}

var timer = new Time;

function mainloop(){
	/* Interpolation */
	var dt = timer.reset() / 1000;
	
	for( var i = 0 ; i < cdata.units.length; ++ i ){
		var unit = cdata.units[i];
				
		unit.x = unit.x + unit.vx * dt;
		unit.y = unit.y + unit.vy * dt;
	}
	
	for( var i = 0 ; i < cdata.heads.length; ++ i ){
		var head = cdata.heads[i];
		
		head.x = head.x + head.vx * dt;
		head.y = head.y + head.vy * dt;
	}
	
	if( mx < 20 ) camx -= 10;
	if( mx > window.innerWidth - 20 ) camx += 10;
	if( my < 20 ) camy -= 10;
	if( my > window.innerHeight - 20 ) camy += 10;
	

	context.fillStyle = "#001F43";
	context.fillRect(0, 0, canvas.width, canvas.height);

	context.save();
	context.translate( -camx, -camy );
		
	for( var i = 0; i < cdata.units.length; ++ i ){
		var unit = cdata.units[i];
		
		drawShip({
			x : unit.x,
			y : unit.y,
			angle : angle( unit ),
			type : unit.type,
			legion : unit.legion
		});
	}
	
	for( var i = 0; i < cdata.heads.length; ++ i ){
		var head = cdata.heads[i];
		
		drawShip({
			x : head.x,
			y : head.y,
			angle : angle( head ),
			type : head.type,
			legion : head.legion
		});
	}

	context.restore();
	
	requestAnimationFrame( mainloop );
}

window.onload = function(){
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	mainloop();
}
