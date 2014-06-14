/**
 *  Global 
 *  -> FLAG : add modernizr check feature needed
 *  -> add local database 
 *  -> make viewRadius circle
 *  -> opt for clearing and re drawing necessary object only 
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
	newDiv.innerHTML = '<div class=chat-message><i>' + from + "</i> : " + message + "</div>";
	var chatbox = document.getElementById("chat-container");
	chatbox.insertBefore(newDiv,chatbox.lastChild);
	chatbox.scrollTop = chatbox.scrollHeight;
}

socket.on('broadcast' ,function( data ){
	appendMessage( data.sender, data.message );
});

var chatinput = document.getElementById('chat-input');

chatinput.addEventListener("keypress", function(e){
	if( e.keyCode == 13 ){
		if( chatinput.value != '' ){
			socket.emit('message', chatinput.value );
			chatinput.value = '';
		}
	}
});

window.addEventListener("keypress", function(e){
	if( e.keyCode == 13 ){
		if( chatinput.style.display == "none" ) {
			chatinput.style.display = "block";
			chatinput.focus();
		} else 
			chatinput.style.display = "none";
	}
});

/** GalaxyOne Space battle
 *  Work :
 *   -> Interpolation
 */

function angle( entity ){
	return Math.atan2( entity.vx, -entity.vy );
}
 
var gRadiusOn = false;

var canvas = document.getElementById("canvas");
var backgroundCanvas = document.getElementById("backgroundCanvas");

var context = canvas.getContext("2d");

var viewRadius = []; // get from server

function drawBackground( canvas ){
	var ctx = canvas.getContext("2d");
	var w = canvas.width;
	var h = canvas.height;
	
	var grd = ctx.createRadialGradient(w/2,h/2,5,w/2,h/2, Math.max(w,h) / 2 );
	grd.addColorStop(0.6, "#001F43");
	grd.addColorStop(1, "#001022");

	ctx.fillStyle = grd;
	ctx.fillRect(0,0,w,h);
}

window.onresize = function( e ){
	backgroundCanvas.width = canvas.width = window.innerWidth;
	backgroundCanvas.height = canvas.height = window.innerHeight;

	drawBackground( backgroundCanvas );
}



var mx = 0;
var my = 0;

// NOTE : planetSize always 3 times unitSize
var camera = {
	x : 0,
	y : 0,
	unitSize : 100,
	planetSize : 300 
};

window.addEventListener("mousemove", function (e) {
	mx = e.pageX;
	my = e.pageY;
});

window.addEventListener("keypress", function (e) {
	if (e.keyCode == 32) {
		gRadiusOn = true;
	}
});

window.addEventListener("keyup", function(e){
	if (e.keyCode == 32) {
		gRadiusOn = false;
	}
	
});

// current dynamic data
var cdata = {
	units : [],
	heads : []
};

// refresh data
socket.on('legion', function( data ){
	cdata = data;
});


// map data
// example : { x : 1500, y : 300, type : 1, radius : 300 }
var planets = [];

socket.on('planet', function( data ){
	planets = data;
});





function ImageCache( image, x, y, width, height, cacheWidth, cacheHeight )
{
	var m_canvas = document.createElement('canvas');

	m_canvas.width = cacheWidth;
	m_canvas.height = cacheHeight;
	var m_context = m_canvas.getContext('2d');
	m_context.drawImage( image, x, y, width, height, 0, 0, cacheWidth, cacheHeight );
	
	this.cache = m_canvas;
}

var drawShip = ( function(){

	// static variable
	var spaceshipImage = new Image();
	var drawCaches = [];

	spaceshipImage.src = "/images/Models_M001_1.png";

	
	return function( options ){
		var _default = {
			x : 0,
			y : 0,
			angle : 0,
			size : 100,
			type : 0,
			legion : 0
		};
		
		var setup = _extend( _default, options );

		if( !(
			camera.x < setup.x + camera.unitSize/2 &&
			setup.x - camera.unitSize/2 < camera.x + canvas.width ||
			camera.y < setup.y + camera.unitSize/2 &&
			setup.y - camera.unitSize/2 < camera.y + canvas.height ) ) return false;
			
		for( var i in setup ){
			if( setup.hasOwnProperty( i ) && i != 'angle' ){
				setup[i] = Math.floor( setup[i] );
			}
		}
		
		if( typeof drawCaches[ setup.legion ] == 'undefined' ){
			drawCaches[ setup.legion ] = [];
		}
		
		if( typeof drawCaches[ setup.legion ][ setup.type ] == 'undefined' ){
			drawCaches[ setup.legion ][ setup.type ] = new ImageCache( spaceshipImage, setup.type * 100, setup.legion * 100, 100, 100, camera.unitSize, camera.unitSize );
		}
		
		var cache = drawCaches[ setup.legion ][ setup.type ].cache;
		
		context.save();
		context.translate(setup.x, setup.y);
		context.rotate( setup.angle);
		context.drawImage(
			cache, 		
			-setup.size/2, 
			-setup.size/2, 
			setup.size, setup.size
			);
		context.restore();
		
		return true;
		
	}	
})();

var drawPlanet = ( function(){
	var planetImage = new Image();
	planetImage.src = "/images/Planets_M001.png";

	var planetDrawCaches = [];
	return function( options ){
		var _default = {
			x : 0,
			y : 0,
			type : 0,
			radius : 150
		}

		var setup = _extend( _default, options );
		
		if( !(
			camera.x < setup.x + camera.planetSize/2 &&
			setup.x - camera.planetSize/2 < camera.x + canvas.width ||
			camera.y < setup.y + camera.planetSize/2 &&
			setup.y - camera.planetSize/2 < camera.y + canvas.height ) ) return false;
		
		
		if( typeof planetDrawCaches[ setup.type ] == 'undefined' ){
			planetDrawCaches[ setup.type ] = new ImageCache( planetImage, setup.type * 300, 0, 300, 300, camera.planetSize, camera.planetSize );
		}
		
		var cache = planetDrawCaches[ setup.type ].cache;
		
		context.save();
		context.translate(setup.x, setup.y);
		context.drawImage(
			cache, 		
			-camera.planetSize/2, 
			-camera.planetSize/2, 
			camera.planetSize, camera.planetSize
			);
		context.restore();
		 
		return true;
	}
})();


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
	
	// simulate velocity while waiting for next data correction to arrive
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
	
	
	// mouse navigation to adjust camera position
	if( mx < 20 ) camera.x -= 10;
	if( mx > window.innerWidth - 20 ) camera.x += 10;
	if( my < 20 ) camera.y -= 10;
	if( my > window.innerHeight - 20 ) camera.y += 10;
	
	context.clearRect( 0,0, canvas.width,canvas.height );
	
	context.save();
	context.translate( -camera.x, -camera.y );

	if( gRadiusOn ){
		// FLAG : NOT FINISHED , circle for range
		context.strokeStyle = "white";
		for( var i = 0 ; i < cdata.units.length; ++ i ){
			var unit = cdata.units[i];
			
			// WORK FLAG : if not current legion
			
			context.beginPath();
			context.arc( unit.x,unit.y, 400, 0, Math.PI*2);
			context.stroke();
		}
	}
		
	for( var i = 0; i < cdata.units.length; ++ i ){
		var unit = cdata.units[i];
		
		// if drawn
		drawShip({
			x : unit.x,
			y : unit.y,
			angle : angle( unit ),
			size : camera.unitSize,
			type : unit.type,
			legion : unit.legion
		})
	}
	
	for( var i = 0; i < cdata.heads.length; ++ i ){
		var head = cdata.heads[i];
		
		// if drawn
		drawShip({
			x : head.x,
			y : head.y,
			angle : angle( head ),
			size : camera.unitSize,
			type : head.type,
			legion : head.legion
		});
	}


	for( var i = 0; i < planets.length; ++ i ){
		drawPlanet( planets[i] );
	}

	context.restore();
		
	requestAnimationFrame( mainloop );
}

window.addEventListener("load", function(){
	backgroundCanvas.width = canvas.width = window.innerWidth;
	backgroundCanvas.height = canvas.height = window.innerHeight;

	drawBackground( backgroundCanvas );
	
	// start the never ending loop
	mainloop();
});
