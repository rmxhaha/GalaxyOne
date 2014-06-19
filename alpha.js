/**
 *	Important : 
 *	 -> when unit hits planet, it doesn't penetrate 
 *	 -> avoid hitting planet to smooth things out ( DONE )
 *   -> unit and warhead radius based on number
 *  
 *  Not So important
 *   -> divide this file into multiple file
 *  temporary to do list
 *   -> what to do when unit have lost it's sight of target
 *     solution : 
 *          aggressive mode : go there and if found then chase again if not then stop
 *          protective mode : popState
 *   -> planet 
 *      wishlist : undestructable and static, crashing into it won't damage (DONE)
 *   -> put legion pointer at every unit and warhead owned by the legion (DONE)
 *   -> put if to prevent sending data of dead unit (DONE)
 *   -> restructure code to be more fit to MVC in the client side ( Backbone js )
 *   -> restructure folder to make it easier to find files
 *  	-> /public, /module ,
 *   -> sending data by prompt rather than socket.io connection b/c networking errors all the time ( DENIED, b/c restarting server is no big deal and creating interface for prompt is kind of hard )

 */

/****************************************************
 *  External Modules
 ****************************************************/
var async = require('async');
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;

/****************************************************
 *  Global Modules
 ****************************************************/

function only_once(fn) {
	var called = false;
	return function() {
		if (called) {
			return;
			throw new Error("Callback was already called.");
		}
		called = true;
		fn.apply(root, arguments);
	}
}
 
 
function _extend( x, y ){
	for (var key in y) {
		if (y.hasOwnProperty(key)) {
			x[key] = y[key];
		}
	}
	return x;
}

Function.prototype.extend = function ( y ) {
	return _extend( this.prototype, y );
}

function cloneSpecifics( real, props ){
	var clone = {};
	
	for( var i = 0; i < props.length; ++ i ){
		var arg = props[i];
		clone[arg] = Math.floor( real[arg] );
	}
	return clone;
	
}

var freeze = Object.freeze;

function vecLength(x, y) {
	return Math.sqrt(x * x + y * y);
}

function pDistance(x1, y1, x2, y2) {
	return vecLength(x1 - x2, y1 - y2);
}

function unitRange( a, b ){
	return pDistance( a.x, a.y, b.x, b.y );
}

function unitCollide( a, b ){
	return pDistance( a.x, a.y, b.x, b.y ) <= a.radius() + b.radius();
}

function normalize( vec ) {
	var length = vecLength(vec.x, vec.y);
	
	if( length == 0 ) {
		return { x : 0, y : 1 };
	}
	
	vec.x /= length;
	vec.y /= length;
	return vec;
}

/**********************
 *  Experimental stackFSM for the new command module
 *   level means how deep is the stack
 */
var stackFSM = function(){
	this.stack = [];
};

stackFSM.extend({
	pushState : function( callback ){
		this.stack.push( callback );
	},
	popState : function(){
		this.stack.length = this.stack.length - 1;
	},
	update : function( dt ){
		if( this.stack.length == 0 ) return;
		this.stack[ this.stack.length - 1 ].apply( this, arguments );
	},
	getLevel : function(){
		return this.stack.length;
	},
	wipe : function(){
		this.stack.length = 0;
	}
});


/****************************************************
 *  Time Modules
 ****************************************************/

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

/** callEvery
	@background setInterval isn't reliable time keeper so a more reliable one is made on top of setInterval layer
	@param callback  function called every timestep
	@param timestep  in milliseconds
	
	Note : 

	smallest_timestep is caused by limitation is Javascript Virtual Machine
	
	timeout less than 15 milliseconds will be rounded with either 0 ms or 15 ms
	if in the future there is an improvement in the virtual machine 
	please remove this restriction
	
*/



var callEvery = function( callback, timestep ){
	var smallest_timestep = 15;
	
	if( timestep < smallest_timestep ){
		console.log( "WARNING : callEvery benchmark data mention that timeout cannot be less than ",smallest_timestep," due to Javascript virtual machine limitation" );
	}
	
	var timebuffer = 0;
	var timer = new Time;
	
	setInterval( function(){
		timebuffer += timer.reset();
		while( timebuffer > timestep ){
			callback( timestep );
			timebuffer -= timestep;
		}
	}, timestep );
	
};


 /***************************************************
 *  Game Modules
 *  
 *  Todo :
 *   -> avoidance module
 *  Future :
 *   -> support for multiple games in one server
 *   -> Move constants to some other place
 *   -> Mentality Module to handle whether unit should be aggressive or protective
 ***************************************************/

 
/* Global Settings */
var gWidth = 5000;
var gHeight = 5000;
var dispersion_constant = 1;

var uniqueIdModule = ( function(){
	var id = 0;
	
	return {
		uniqueId : function(){
			if ( typeof this.__uniqueid == "undefined" ) {
				this.__uniqueid = ++id;
			}
			return this.__uniqueid;			
		}
	};
	
})();


/** Metrics
 *  - viewRadius in pixel
 *  - reloadSpeed in milliseconds
 */
var WarheadType = {
	missile : { codex : 6, damage : 0.5, travelRange : 1000, vmax : 500 }
};

var UnitType = {
	spy : { codex : 0, viewRadius : 700, 	reloadSpeed : 1500,	warheadType : -1,	vmax : 300 },
	mothership : { codex : 1, viewRadius : 1000, 	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 100 },
	shuttle : { codex : 2, viewRadius : 600,	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 350 },
	fighter :  { codex : 3, viewRadius : 600,	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 400 },
	destroyer : { codex : 4, viewRadius : 400,	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 350 },
	explorer : { codex : 5, viewRadius : 400,	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 350 }
};




var viewRadiusModule = {
	viewRadius : function(){
		return this.type.viewRadius + this.radius();
	}
};

var attackModule = {
	attackRadius : function(){
		return this.type.warheadType.travelRange;
	},
	reloadSpeed : function(){
		return this.type.reloadSpeed;
	},
	lastAttack : new Date,
	getHeadType : function(){
		return this.type.warheadType;
	},
	launchWarHeadAt : function( target ){
		if( unitRange( this, target ) > this.attackRadius() ) return;
		
		var now = new Date();
		
		if( now - this.lastAttack > this.reloadSpeed() ){
			this.lastAttack = now;
			
			this.legion.addHead( new Warhead({
				x : this.x,
				y : this.y,
				number : this.number,
				type : this.getHeadType(),
				vx : this.vx,
				vy : this.vy,
				target : target
			}) );
		}
	},
	mental : 'aggressive'
}

var MovementModule = {
	x : 0,
	y : 0,
	vx : 0,
	vy : 0,
	ax : 0,
	ay : 0,
	vmax : 200,
	amax : 400,
	angle : function(){
		return Math.atan2(this.vx,  - this.vy);
	},
	seekAtFullSpeed : function (tx, ty) {
		this.seek(tx, ty, 1);
	},
	seek : function (tx, ty, c) {

		var dx = tx - this.x;
		var dy = ty - this.y;
		var r = Math.sqrt(dx * dx + dy * dy);

		// slowing radius
		var d = this.vmax * 3;

		var c = c || ((r < d ? r / d : 1));
		var dvx = dx / r * this.vmax * c - this.vx;
		var dvy = dy / r * this.vmax * c - this.vy;

		this.ax += dvx;
		this.ay += dvy;
	},
	persuit : function (ship) {
		var dist = pDistance(ship.x, ship.y, this.x, this.y);

		// coordinate prediction
		var px = ship.x + ship.vx * dist / this.vmax;
		var py = ship.y + ship.vy * dist / this.vmax;

		this.seek(px, py);
	},
	persuitAtFullSpeed : function (ship) {
		var dist = pDistance(ship.x, ship.y, this.x, this.y);

		// coordinate prediction
		var px = ship.x + ship.vx * dist / this.vmax;
		var py = ship.y + ship.vy * dist / this.vmax;

		this.seekAtFullSpeed(px, py);
	},
	fleeAtFullSpeed : function (tx, ty, c) {

		var dx = tx - this.x;
		var dy = ty - this.y;
		var r = Math.sqrt(dx * dx + dy * dy);

		c = c || 1;

		var dvx = dx / r * this.vmax * c - this.vx;
		var dvy = dy / r * this.vmax * c - this.vy;

		this.ax += -dvx;
		this.ay += -dvy;
	},
	rapidStop : function(){
		this.ax -= this.vx;
		this.ay -= this.vy;
	},
	updateMovement : function( dt ){
		// truncate acceleration
		var aLength = vecLength(this.ax, this.ay);
		if (aLength > this.amax) {
			this.ax = this.ax / aLength * this.amax;
			this.ay = this.ay / aLength * this.amax;
		}

		this.vx += this.ax * dt;
		this.vy += this.ay * dt;

		var L = vecLength(this.vx, this.vy);

		var vLength = vecLength(this.vx, this.vy);
		if (vLength > this.vmax) {
			this.vx = this.vx / vLength * this.vmax;
			this.vy = this.vy / vLength * this.vmax;
		}

		this.x += this.vx * dt;
		this.y += this.vy * dt;

		// reset acceleration
		this.ax = 0;
		this.ay = 0;	
	}
};


var HealthModule = {
	numberMax : 0,
	number : 1,
	shield : 1, // shield shouldn't be zero
	hit : function( warhead ){
		assert( warhead.damage, "HealthModule.hit : warhead doesn't have damage" );

		this.number -= warhead.damage() / this.shield;
		if( this.number <= 0 ){
			this.emit( 'death' );
		}
		else {
			this.emit( 'under-attack' );
		}
	},
	isDead : function(){
		return this.number <= 0;
	},
	radius : function(){
		// 100px / 10k unit
		// using num ~ pi * rad * rad
		return 100 * Math.sqrt( this.number / 1000 );
	}
};


var CommandModule = ( function() {
	/** CommandModule
	 *   Here lies a Finite State Machine for the ship to follow command
	 *   with basically 2 mentality of the ship
	 *    -> aggressive 
	 *    -> protective
	 *  
	 *  Note : use bind to provide data to command that need additional data ( move, attack, etc. )
	 */

	
	var idle = function(){
		/**
		 * aggressive
		 *  if enemy nearby then pushState chase attack
		 * protective
		 *  if enemy nearby pushState anchorAttack
		 */
		 
		switch( this.mental ){
		case 'aggressive':
			
		break;
		case 'protective':
			
			break;
		}
		
		if( -10 >= this.vx || this.vx >= 10 ||
			-10 >= this.vy || this.vy >= 10 ){
			this.rapidStop();
		}
		else {
			this.vx = 0;
			this.vy = 0;
		}
	}
			
	var chaseAttack = function( target ){
		/**
		 *  if enemy - self distance is 1/5 fire range then stop else chase
		 *  if enemy - self distance is fire range than fire missile
		 *  if enemy - self distance is out of sight then popState and pushState move order to last coordinate seen
		 *  
		 */
		 
	
		if( target.isDead() || this.isDead() ){
			this.brain.popState();

			return;
		}
		
		
		if( !this.legion.withinVisual( target )){
			this.brain.popState();
			this.brain.pushState( move.bind( this, target.x, target.y ) );
			
			return;
		}

		var range = unitRange( this, target );
		
		if( range > this.viewRadius() / 5 ){
			this.persuit( target );
		}
		else {
			this.rapidStop();
		}
		
		this.launchWarHeadAt( target );
		
	}
	
	var move = function( tx, ty ){
		/**
		 *  move to designated target
		 *  if enemy nearby shoot if close enough
		 */
		switch( this.mental ){
		case 'aggressive':
			
		break;
		case 'protective':
			
			break;
		}
		
		if( this.isDead() ) 
			this.brain.popState();
		
		
		this.seek( tx, ty );
		
		if( 
			-10 < this.vx && this.vx < 10 &&
			-10 < this.vy && this.vy < 10 &&
			pDistance( tx, ty, this.x, this.y ) < 10 )
			{
			
			// force stop
			this.vx = 0;
			this.vy = 0;
			this.ax = 0;
			this.ay = 0;
			
			this.brain.popState();
			
			}
		
	}

	var anchorAttack = function(){
		/**
		 * protective
		 * 	if enemy in close enough range then fire
		 *  if not then popState
		 * aggressive
		 *  popState
		 *  chaseAttack( target )
		 */
	}


	
	return {
		createBrain : function(){
			if( typeof this.brain == 'undefined' ) {
				this.brain = new stackFSM();
				this.mental = "protective";
				
				this.brain.pushState( idle );
			}
		},
		attack : function( target ){
			this.createBrain(); // making sure there is a brain
			this.stop();

			// pushState chaseAttack
			this.brain.pushState( chaseAttack.bind( this, target ) );
		},
		moveTo : function( x, y ){
			this.createBrain(); // making sure there is a brain
			this.stop();
			
			this.brain.pushState( move.bind( this, x, y ) );
		},
		guard : function( x, y ){
			this.createBrain(); // making sure there is a brain
		},
		split : function(){
			this.createBrain(); // making sure there is a brain
			
		},
		stop : function(){
			while( this.brain.getLevel() != 1 )
				this.brain.popState();
		},
		changeMentality : function( mental ){
			switch( mental ){
			case 'aggressive':
			case 'protective':
				this.mental = mental;
				break;
			}
		},
		updateState : function( dt ){
			this.createBrain();
			this.brain.update( dt );
		}
	}	
})();

var Spaceship = function Spaceship( setup ) {
	// HACK FLAG 
	if( typeof setup.vmax !== 'undefined' ){
		console.log('WARNING : vmax is defined in unit')
	}
	
	if( typeof setup.type === 'undefined' ){
		throw new Error('type is not defined');
	}

	if( typeof setup.number !== 'number' ){
		throw new Error('number is not defined');
	}
	
	_extend( this, setup );

	// make sure that no hack is possible
	// change later if hack is required

	this.uniqueId(); // make sure it has an unique id
	this.vmax = setup.type.vmax;
}

Spaceship.extend( uniqueIdModule );
Spaceship.extend( EventEmitter.prototype )
Spaceship.extend({ 
	type : 0, 
	update : function( dt ){
		this.updateState( dt );
		this.updateMovement( dt );
	}
});

Spaceship.extend( HealthModule );
Spaceship.extend( MovementModule );
Spaceship.extend( viewRadiusModule );
Spaceship.extend( attackModule );
Spaceship.extend( CommandModule );

var Warhead = function Warhead( setup ){
	this.uniqueId(); // make sure it has an id
	
	if( !setup.target ){
		console.log("BUG FLAG : TARGETLESS Warhead");
	}

	if( typeof setup.vmax != 'undefined' ){
		console.log('WARNING : vmax is defined in unit')
	}
	
	if( typeof setup.type === 'undefined' ){
		throw new Error('type is not defined');
	}

	if( typeof setup.number !== 'number' ){
		throw new Error('number is not defined');
	}
	
	this.vmax = this.type.vmax;
	
	_extend( this, setup );
	
	var dir = normalize({ x : this.vx, y : this.vy });
	
	this.vx = dir.x * this.vmax;
	this.vy = dir.y * this.vmax;
}

Warhead.extend( HealthModule );
Warhead.extend( uniqueIdModule );
Warhead.extend( EventEmitter.prototype );
Warhead.extend({ 
	type : WarheadType.missile, 
	distanceTraveled : 0,
	maxTravelDistance : function(){
		return this.type.travelRange;
	},
	damage : function(){
		return this.number * this.type.damage;
	},
	isOutOfFuel : function(){
		return this.distanceTraveled > this.maxTravelDistance();
	},
	update : function( dt ){
		if( !this.target.isDead() ){
			this.persuitAtFullSpeed( this.target );
		}
		
		this.updateMovement( dt );
		
		var travelRange = vecLength( this.vx * dt, this.vy * dt );
		this.distanceTraveled += travelRange;

		if( this.isOutOfFuel() ){
			this.emit('explosion');
		}
	}
});

Warhead.extend( MovementModule );

var Planet = function( setup ){
	this.uniqueId();
	
	// type is just for client view ( it doesn't affect the game for now )
		
	if( typeof setup.x === 'undefined' || typeof setup.y === 'undefined' ) 
		throw new Error('planet\'s coordinate must be specified');
	
	_extend( this, setup );
	
	if( typeof this.type === 'undefined' ) {
		this.type = Math.floor(Math.random() * 5); // 5 because there is currently only 5 type of planet in the spritesheet
	}
}

Planet.extend( uniqueIdModule );
Planet.extend( MovementModule );
Planet.extend({ 
	radius : function(){ return 150; }, 
	type : 99, 
	damage : function(){
		return Infinity;
	} 
});

var Galaxy = function( gWidth, gHeight ){
	// statics objects such as planets, asteroids
	var statics = [];

	this.addPlanet = function( planet ){
		assert( planet instanceof Planet, "Galaxy.addPlanet : this isn't planet" );

		statics.push( planet );		
	}
		
	// collections of legions
	var legions = []; 

	var LegionId = {
		red : 0,
		blue : 1,
		yellow : 2,
		green : 3
	};
	
	function Legion( name ){
		this.name = name;
		this.id = LegionId[name];
		this.units = [];
		this.warheads = [];
		
		// commander module array
		
		this.attackList = [];
		this.moveList = [];
	}

	Legion.extend({
		addUnit : function( unit ){
			assert( unit instanceof Spaceship, "addUnit : Type is not Spaceship" );
			
			unit.legion = this;
			
			this.units.push( unit );
			return unit;
		},
		addHead : function( warhead ){
			assert( warhead instanceof Warhead, "addHead : Type is not Warhead" );
			
			warhead.legion = this;
			
			this.warheads.push( warhead );
			return warhead;
		},
		updateEntities : function( dt ){
			/**************************************
			 * > removing dead unit 
			 * > update existing unit 
			 **************************************/

			for( var i = this.warheads.length; i -- ; ){
				var head = this.warheads[i];
				
				head.update( dt );

				if( head.isOutOfFuel() ){
					this.warheads.splice( i, 1 );
				}
			}
			
			for( var i = this.units.length; i --;  ){
				// remove dead unit
				if( this.units[i].isDead() ){
					this.units.splice( i, 1 );					
					continue;
				}
				
				this.units[i].update( dt );
			}
		},
		withinVisual : function( entity ){
			// entity must have coordinate x and y
			
			for( var i = 0; i < this.units.length; ++ i ){
				var dx = this.units[i].x - entity.x; dx *= dx;
				var dy = this.units[i].y - entity.y; dy *= dy;
				var r = this.units[i].viewRadius(); r *= r;
				
				if( dx + dy < r ){
					return true;
				}
			}
			
			// WARNING : do not add visual check for warheads since warheads doesn't have any eye
			return false;
		}
	});
	
	/************************************
	 * Commander Module
	 *   -> handles incoming commands and when to stop 
	 *   -> handles mentality of unit when to attack and not
	 *************************************/
	var commandId = {
		moveTo : 0,
		attack : 1,
		split : 2,
		guard : 3
	};
	 

	
	Legion.extend({
		/* WARNING : make sure to have a very through check because data coming to this function is from client and can be hacked */
		issueCommand : function( command )
		{
			if( !command ) return;
			if( typeof command.uid != 'number' ) return;
			if( typeof command.cid != 'number' ) return;
			
			
			// search for this specific unit given command to
			
			var uid = command.uid;
			var unit = false;
			
			for( var i = 0; i < this.units.length; ++ i ){
				if( this.units[i].uniqueId() == uid ){
					unit = this.units[i];
				}
			}
			
			// if unit is not found
			if( !unit ) return;

			switch( command.cid ){
			case commandId.moveTo:
				if( typeof command.x != 'number' ) return;
				if( typeof command.y != 'number' ) return;
		
				this.stopUnit( uid );
				this.moveList.push( new MoveOrder( unit, command.x, command.y ) );
				break;
				
			case commandId.attack:
				if( typeof command.tid != 'number' ) return;
				if( typeof command.tlegion != 'number' ) return;
				
				if( command.tlegion == this.id ) {
					console.log("WARNING : Bug occur current unit targeting its own legion");
					console.log("COUNTER MEASSURE : Ignoring command " );
					return;
				}
				
				var target = false;
				/* searching for the target unit */
				// BAD OOP FLAG : breaking the OOP encapsulation rules
				for( var i = 0; i < legions.length; ++ i ){
					var legion = legions[i];

					if( legion.id == command.tlegion ) {
					
						for( var k = 0; k < legion.units.length; ++ k ){
							if( legion.units[k].uniqueId() == command.tid ){
								target = legion.units[k];
								break;
							}
							
							
						}
						break;
					}				
				}
				
				if( !target ){
					console.log( "WARNING : Attacker not found" );
					return;
				}
				
				this.stopUnit( uid );
				this.attackList.push( new AttackOrder( unit, target ) );
				break;
			case commandId.split:
				var num = Math.floor( unit.number / 2 );

				// IMPROVEMENT FLAG : splitting cannot be done to legion lesser than x units
				if( num < 1 ) return;
				
				// plus one if the number is odd
				unit.number = num + unit.number % 2;
				
				// EXPERIMENTAL FLAG
				var unit2 = this.addUnit( new Spaceship( unit ) );
				
				unit.x -= unit.radius();
				unit2.x += unit2.radius();
				
				break;
			case commandId.guard:
				break;
			}
			
		}
	});	
	
	this.addLegion = function( name ){
		assert( LegionId.hasOwnProperty( name ), "Legion name doesn't exist" );
		
		// register legion existence
		var legion = new Legion( name );
		legion.galaxy = this;
		
		legions.push( legion );
		return legion;
	}
	
	/** getClientData
	 *  returns current legion spaceship and enemy legions that is visible to the current legion
	 */
	 
	Legion.extend({
		getClientData : function(){
			/* collect units in current legion radar */

			var output = {
				units : [],
				heads : []
			};
			
			function appendUnit( legionId, unit ){
				if( unit.isDead() ) return;
				
				var data = cloneSpecifics( unit, ['x','y','vx','vy']);
				data.radius = unit.radius();
				data.type = unit.type.codex;
				data.legion = legionId;
				
				output.units.push( data );
			}
			
			function appendHead( legionId, head ){
				if( head.isOutOfFuel() ) return;
			
				var data = cloneSpecifics( head, ['x','y','vx','vy']);
				data.radius = head.radius();
				data.type = head.type.codex;
				data.legion = legionId;
				
				output.heads.push( data );
			}
			
			// BAD OOP FLAG : breaking the OOP encapsulation rules
			for( var a = 0; a < legions.length; ++ a ){
				var legion = legions[a];
				var legionId = legions[a].id;
				
				if( legion === this ) {
					// legion's units
					for( var i = 0; i < legion.units.length ; ++ i ) 
						appendUnit( legionId, legion.units[i] );
				}
				else {
					// legion's enemy
					for( var i = 0; i < legion.units.length ; ++ i ){
						if( this.withinVisual( legion.units[i] ) ){
							appendUnit( legionId, legion.units[i] );
						}
					}				
				}

				// warhead is unable to see so radar that have been fired if get out of range become invisible whether it's the legion's missle or not
				for( var i = 0; i < legion.warheads.length ; ++ i ){
					if( this.withinVisual( legion.warheads[i] ) ){
						appendHead( legionId, legion.warheads[i] );
					}
				}
				
			}
			
			return output;
			
		}
	});
	 
	this.update = function( dt ){	
		/** Collision System 
		 *   -> unit collision with Warhead
		 *   -> unit collision with static objects ( e.g. planets )
		 */
		for( var u = 0; u < legions.length; ++ u ){
			// units against enemy warheads
			for( var w = 0; w < legions.length; ++ w ){
				if( u == w ) continue;
				
				// references
				var units = legions[u].units;
				var warheads = legions[w].warheads;
				
				/** check if warhead hits
				 *  if it does tell unit that it has been hit
				 *  				emit event explosion
				 *  				and destroy the warhead after that
				 */
				for( var i = 0; i < units.length; ++ i ){
					for( var k = warheads.length; k -- ; ){
						if( unitCollide( units[i], warheads[k] ) ){
							units[i].hit( warheads[k] );
							warheads[k].emit('explosion');
							warheads.splice( k, 1 );
						}
					}
				}
				
			}
			
			var legion = legions[u];

			for( var k = 0; k < statics.length; ++ k ){
				var _static = statics[k];
				
			// units against statics			
				for( var i = legion.units.length; i --;  ){
					var unit = legion.units[i];
					if( unitCollide( unit, _static ) ){
						// fix location
						var dx = unit.x - _static.x;
						var dy = unit.y - _static.y;
						
						var r = Math.sqrt( dx * dx + dy * dy );

						var l = unit.radius() + _static.radius();

						unit.x = _static.x + l * dx / r ;
						unit.y = _static.y + l * dy / r ;
												
						break;
					}
				}
			// warheads against statics
				for( var i = legion.warheads.length; i --;  ){
					if( unitCollide( legion.warheads[i], _static ) ){
						
						legion.warheads.number = -1;
						legion.warheads.splice( i, 1 );
						
						break;
					}
				}

			}
			
		}
		
		/**  Dispersion System
		 *   -> even if unit may overlap each other, it tries not to
		 *   -> only disperse on idle ?
		 */
/*
		for( var u = 0; u < legions.length; ++ u ){
			var legion = legions[u];
			for( var i = 0; i < legion.units.length; ++ i ){
				var unit = legion.units[i];
				for( var p = 0; p < legions.length; ++ p ){
					var legion2 = legions[p];
					for( var q = 0; q < legion2.units.length; ++ q ){
						var unit2 = legion2.units[q];

						if( unit == unit2 ) continue;
						
						
						// using columb force equation b/c that what I can think of
						
						var range = unitRange( unit, unit2 );
						
						var force = dispersion_constant * unit.number * unit2.number / range / range;
						
						console.log( force );
						
						// force direction
						var direction = normalize({ x : unit2.x - unit.x, y : unit2.y - unit.y});
						
						unit.ax += direction.x * force;
						unit.ay += direction.y * force;
						
						unit2.ax -= direction.x * force;
						unit2.ay -= direction.y * force;
						
						
					}
				}
			}
		}
		
		*/ 
		
		/** Collision Avoidance system
		 *  -> Avoidance system is applied to only static objects
		 *  -> Dynamic objects such as warheads are not worth avoiding b/c you pretty much cannot avoid them 
		 *  -> Another unit whether they are friend or foe aren't considered collided when they overlap 
		 *     so there is no need to prevent collision since there will be no collisions
		 *  
		 */
		
		for( var u = 0; u < legions.length; ++ u ){
			var legion = legions[u];
			for( var i = 0; i < legion.units.length; ++ i ){
				var unit = legion.units[i];

				var MAX_SEE_AHEAD = unit.vmax * dt * 10;

				
				var vdir = normalize({ x : unit.vx, y : unit.vy });
				var ahead_x = unit.x + vdir.x * MAX_SEE_AHEAD;
				var ahead_y = unit.y + vdir.y * MAX_SEE_AHEAD;
				
				var ahead2_x = unit.x + vdir.x * MAX_SEE_AHEAD * 0.5;
				var ahead2_y = unit.y + vdir.y * MAX_SEE_AHEAD * 0.5;
								
				var mostThreatening = false;
				var mostThreateningRange = Infinity;
				
				for( var k = 0; k < statics.length; ++ k ){
					if( 
						pDistance( ahead_x, ahead_y, _static.x, _static.y ) < _static.radius() ||
						pDistance( ahead2_x, ahead2_y, _static.x, _static.y ) < _static.radius() 
						){
						
						// FLAG : which is better range to unit it self or the predicted location ( ahead ) 
						var range = pDistance( unit.x, unit.y, _static.x, _static.y );
						if( range < mostThreateningRange ){
							mostThreatening = _static;
							mostThreateningRange = range;
						}
					}
				}
				
				if( mostThreatening ){

					var MAX_AVOID_FORCE = unit.amax;
					var avoidance_force = normalize({ x : ahead_x - mostThreatening.x, y : ahead_y - mostThreatening.y});
					
					unit.ax += avoidance_force.x * MAX_AVOID_FORCE;
					unit.ay += avoidance_force.y * MAX_AVOID_FORCE;
				}
				
			}
			
		}
		
		
		// WARNING : Collision Avoidance hasn't been tested
		
		/** Missile Homing system
		 *   -> Seek target at full speed
		 */
		
		/* Legion logics update */
		for( var i = 0; i < legions.length; ++ i ){
			legions[i].updateEntities( dt );
		}
		
	}

	this.getPlanets = function(){
		var data = [];
		
		for( var i = 0; i < statics.length; ++ i ){
			data[i] = cloneSpecifics( statics[i], ['x','y','radius','type'] );
		}
		
		return data;
	}
}


var GalaxyOne = new Galaxy( 5000, 5000 );

var redlegion = GalaxyOne.addLegion( "red" );


var unitone = redlegion.addUnit( new Spaceship({ x : 1000, y : 800, type : UnitType.mothership, number : 300 }) );
var unitwo = redlegion.addUnit( new Spaceship({ x : 200, y : 180, type : UnitType.destroyer, number : 200 }) );
var unit3 = redlegion.addUnit( new Spaceship({ x : 1500, y : 2000, type : UnitType.shuttle, number : 50 }) );


unitone.on('under-attack', function(){
	console.log("I am hit !");
});

unitone.on('death', function(){
	console.log( " Me death");
});

var blueLegion = GalaxyOne.addLegion( "blue" );


fune = blueLegion.addUnit( new Spaceship({ x : 1000, y : 1000, number : 10000, type : UnitType.spy }) );
blueLegion.addUnit( new Spaceship({ x : 3000, y : 1000, type : UnitType.spy, number : 100 }) );

setInterval( function(){
	fune.moveTo( 0, 0 );	
}, 12000 );

setTimeout( function(){
	setInterval( function(){
		fune.moveTo( 1000, 1000 );
	}, 12000 );
}, 6000 );

unitone.attack( fune );
unitwo.attack( fune );
unit3.attack( fune );

/*
setInterval( function(){
	console.log( fune.uniqueId() );
	blueLegion.issueCommand({uid:fune.uniqueId(), cid:2});
}, 1000 );
*/

/*
for( var i = 100; i--; ){
	blueLegion.addUnit( new Spaceship({ x : Math.random() * 5000, y : Math.random() * 5000 }) );
	redlegion.addUnit( new Spaceship({ x : Math.random() * 5000, y : Math.random() * 5000 }) );
}
*/
// haven't been tested
GalaxyOne.addPlanet( new Planet({ x : 500, y : 400, type : 0 }) );


var flag = false;

// game simulation
function mainloop( dt ){
	// convert to milliseconds
	dt /= 1000; 
	
	GalaxyOne.update( dt );	
}

callEvery( mainloop, 50 );


/**
 *  Client interfaces
 */

var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');

var app = express()
  , server = require('http').Server(app)
  , io = require('socket.io')(server);

// WORK FLAG : change cookie storage from MemoryStore ( RAM ) to RedisStore for better memory management
// 			http://expressjs-book.com/forums/topic/express-js-sessions-a-detailed-tutorial/
  
// enable session in express js
app.use( cookieParser() );
  
var session_storage = new session.MemoryStore();
var session_secret = 'LoveWillMakeYouMuchStronger';
var session_key = 'sesid';

app.use( session({ secret : session_secret, store : session_storage }) );

io.set('authorization', function(handshake, callback) {
	
	if (handshake.headers.cookie) {
		// pass a req, res, and next as if it were middleware
		cookieParser( session_secret )(handshake, null, function(err) {
			if( err ) {
				console.log("Ses Errs ");
				return callback('Session not found.', false);
			}
			
			
			handshake.session = handshake.signedCookies['connect.sess'];
			return callback( null, true );
		});
	} else {
		return callback('No session.', false);
	}
});

app.use( bodyParser() );

/*
app.use(express.cookieParser({ 
	secret : 'LoveWillMakeYouMuchStronger',
	key : 'express.sid'
}));
*/

app.use('/codex/', express.static(__dirname + '/codex/'));
app.use('/images/', express.static(__dirname + '/images/'));

server.listen(9414);

app.get('/', function (req, res) {
	if( !req.session.name ) {
		res.redirect("/login/");
		return
	}

	res.sendfile(__dirname + '/template/index.html');
});

app.get('/login/', function( req,res ){
	res.sendfile(__dirname + '/template/login.html');
});

app.post('/login/', function( req, res ){
	if( req.session.name ) {
		res.redirect("/");
		return;
	}

	if( req.body.name )	{
		req.session.name = req.body.name;
		res.redirect("/");
		return;
	}
	
	res.redirect('/login/');
});


 /****************************************************
 *  Networking Modules
 *  
 *  -> Data keeper
 *  -> broadcast data as necessary
 ****************************************************/

io.on('connection', only_once( function( socket ){
/*
redlegion.issueCommand({
	uid : unitwo.uniqueId(), 
	cid : 1, 
	tid : fune.uniqueId(), 
	tlegion : blueLegion.id
});
*/
	var session = [];

	async.series( [
		function( callback ){
			cookieParser( session_secret )( socket.handshake, null, function(err) {
				session = socket.handshake.signedCookies['connect.sess'];
				callback();
			});
		}, function( callback ){
			var legion = redlegion; // will be setup by connection later on
			
			socket.emit('planet', GalaxyOne.getPlanets() );
			
			socket.on('message', function( data ){
				io.sockets.emit('broadcast', {sender : session.name, message : data} );
			});
			
			socket.on('disconnect', function(){
				// client disconnected
			});

			socket.on('command', function( command ){
				legion.issueCommand( command );
			});
			
			function updateState(){
				socket.emit('legion', legion.getClientData() );
				
			}
				
			/**
			 *  FUTURE FEATURE : update all data at first then update again at a certain period of time
			 *  				 only send updates
			 */
			callEvery( updateState, 100 );
			updateState();
			
		}
	], function( err ){
		throw err;
	});
}) );


/*
	WORK FLAG : on the socket authentication and routing system
*/
 
 
