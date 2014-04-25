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

function drawViewCircle( units ){
	
	var fullCircle = Math.PI * 2;
	
	function angle(){
		this.from = 0;
		this.to = fullCircle;
		
		function cleanCut( from, to ){
			
		}
		
		this.cut = function( from, to ){
			from = from % fullCircle;
			to = to % fullCircle;
			
			if( from > to ){
				var tmp = from;
				from = to;
				to = tmp;
			}
			
			if( to - from ){
				
			}
			
		}
	}
	
	
	for( var i = 0; i < units.length; ++ i ){
		var angle = new angle;
		var unit = units[i];
		var rad = viewRadius[ unit.type ];
		var angle = angles[i];
		
		angles[i] = angle;
		
		
	}
	
	
}
 
var canvas = document.getElementById("canvas");
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
	debugcanvas.width = canvas.width = window.innerWidth;
	debugcanvas.height = canvas.height = window.innerHeight;

	drawBackground( debugcanvas );
}



var mx = 0;
var my = 0;

var camx = 0;
var camy = 0;

var drawSize = 100; // size of unit

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

function ImageCache( image, x, y, width, height, cacheWidth, cacheHeight )
{
	var m_canvas = document.createElement('canvas');

	m_canvas.width = cacheWidth;
	m_canvas.height = cacheHeight;
	var m_context = m_canvas.getContext('2d');
	m_context.drawImage( image, x, y, width, height, 0, 0, cacheWidth, cacheHeight );
	
	this.cache = m_canvas;
}

var drawCaches = [];

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

	if( !(
		camx < setup.x + drawSize/2 &&
		setup.x - drawSize/2 < camx + canvas.width ||
		camy < setup.y + drawSize/2 &&
		setup.y - drawSize/2 < camy + canvas.height ) ) return false;
		
	for( var i in setup ){
		if( setup.hasOwnProperty( i ) && i != 'angle' ){
			setup[i] = Math.floor( setup[i] );
		}
	}
	
	if( typeof drawCaches[ setup.legion ] == 'undefined' ){
		drawCaches[ setup.legion ] = [];
	}
	
	if( typeof drawCaches[ setup.legion ][ setup.type ] == 'undefined' ){
		drawCaches[ setup.legion ][ setup.type ] = new ImageCache( spaceshipImage, setup.type * 100, setup.legion * 100, 100, 100, drawSize, drawSize );
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

// past data
var pcx = 0;
var pcy = 0;
var pastRects = [];
var psize = drawSize;


var c = 0;
var t = 0;

function mainloop(){
	/* Interpolation */
	var dt = timer.reset() / 1000;
	
	t += dt;
	if( c ++ % 100 == 0 ) console.log( c / t, " FPS" );
	
	
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
	

	context.save();
	context.translate( -camx, -camy );
	for( var i = 0; i < pastRects.length; ++ i ){
		var r = pastRects[i];
		
		context.clearRect( r.x - psize, r.y - psize, psize * 2, psize * 2 ); 
	}
	context.restore();
	context.clearRect( 0,0, canvas.width, canvas.height );

	context.save();
	
	// storing current data for later ( clearing efficiently )
	pcx = camx;
	pcy = camy;
	psize = drawSize;
	
	context.translate( -camx, -camy );

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
		if( drawShip({
				x : unit.x,
				y : unit.y,
				angle : angle( unit ),
				size : drawSize,
				type : unit.type,
				legion : unit.legion
			}))
			{
				pastRects.push( unit.x, unit.y );
			}
	}
	
	for( var i = 0; i < cdata.heads.length; ++ i ){
		var head = cdata.heads[i];
		
		// if drawn
		if( drawShip({
				x : head.x,
				y : head.y,
				angle : angle( head ),
				size : drawSize,
				type : head.type,
				legion : head.legion
			}))
			{
				pastRects.push( head.x, head.y );
				
			}
		
	}

	context.restore();
	
	requestAnimationFrame( mainloop );
}

window.onload = function(){
	debugcanvas.width = canvas.width = window.innerWidth;
	debugcanvas.height = canvas.height = window.innerHeight;

	drawBackground( debugcanvas );
	
	mainloop();
}
