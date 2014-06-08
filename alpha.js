/**
 *  temporary to do list
 *   -> vmax for unit ( DONE )
 *   -> what to do when unit have lost it's sight of target
 *     solution : 
 *          aggressive mode : go there and if found then chase again if not then stop
 *          protective mode : popState
 *   -> planet 
 *      wishlist : undestructable and static, crashing into it won't damage
 *   -> put legion pointer at every unit and warhead owned by the legion (DONE)
 *   -> put if to prevent sending data of dead unit (DONE)
 *   -> restructure code to be more fit to MVC in the client side ( Backbone js )
 *   -> restructure folder to make it easier to find files
 *   -> divide this file into multiple file
 *   -> sending data by prompt rather than socket.io connection b/c networking errors all the time
 */

/****************************************************
 *  External Modules
 ****************************************************/

var assert = require('assert');
var EventEmitter = require('events').EventEmitter;

/****************************************************
 *  Global Modules
 ****************************************************/

 
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

if ( typeof Object.prototype.uniqueId == "undefined" ) {
	var id = 0;
	Object.prototype.uniqueId = function() {
		if ( typeof this.__uniqueid == "undefined" ) {
			this.__uniqueid = ++id;
		}
		return this.__uniqueid;
	};
}


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
	return pDistance( a.x, a.y, b.x, b.y ) <= a.radius + b.radius;
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


var UnitType = {
	spy : 0,
	mothership : 1,
	shuttle : 2,
	fighter : 3,
	destroyer : 4,
	explorer : 5
};


var WarheadType = {
	missile : 6
};

var UnitDatabase = [];

/** Metrics
 *  - viewRadius in pixel
 *  - reloadSpeed in milliseconds
 */

UnitDatabase[UnitType.spy] 			= { viewRadius : 700, 	reloadSpeed : 1500,	warheadType : -1,	vmax : 300 };
UnitDatabase[UnitType.mothership] 	= { viewRadius : 1000, 	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 100 };
UnitDatabase[UnitType.shuttle]		= { viewRadius : 600,	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 350 };
UnitDatabase[UnitType.fighter]		= { viewRadius : 600,	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 400 };
UnitDatabase[UnitType.destroyer]	= { viewRadius : 400,	reloadSpeed : 1500,	warheadType : WarheadType.missile, vmax : 350 };

var WarheadDatabase = [];

WarheadDatabase[WarheadType.missile]	= { damage : 0.5, travelRange : 1000, vmax : 500 };

var viewRadiusModule = {
	viewRadius : function(){
		return UnitDatabase[this.type].viewRadius;
	}
};

var attackModule = {
	attackRadius : function(){
		return WarheadDatabase[ this.getHeadType() ].travelRange;
	},
	reloadSpeed : function(){
		return UnitDatabase[ this.type ].reloadSpeed;
	},
	lastAttack : new Date,
	getHeadType : function(){
		return UnitDatabase[ this.type ].warheadType;
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
	}
			
	var chaseAttack = function(){
		/**
		 *  if enemy - self distance is 1/5 fire range then stop else chase
		 *  if enemy - self distance is fire range than fire missile
		 *  if enemy - self distance is out of sight then popState and pushState move order to last coordinate seen
		 *  
		 *  this.target -> data came from bind when pushing state
		 */
		 
		var target = this.target;
		
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
	if( typeof setup.vmax != 'undefined' ){
		console.log('WARNING : vmax is defined in unit')
	}
	
	_extend( this, setup );

	// make sure that no hack is possible
	// change later if hack is required

	this.uniqueId(); // make sure it has an unique id
	this.vmax = UnitDatabase[ setup.type ].vmax;
}

Spaceship.extend( EventEmitter.prototype )
Spaceship.extend({ 
	type : 0, 
	radius : 30,
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
	
	this.vmax = WarheadDatabase[ this.type ].vmax;
	
	_extend( this, setup );
	
	var dir = normalize({ x : this.vx, y : this.vy });
	
	this.vx = dir.x * this.vmax;
	this.vy = dir.y * this.vmax;
	
	console.log( this.vx, this.vy );
}

Warhead.extend( EventEmitter.prototype );
Warhead.extend({ 
	type : WarheadType.missile, 
	radius : 20,
	number : 1,
	distanceTraveled : 0,
	maxTravelDistance : function(){
		return WarheadDatabase[this.type].travelRange;
	},
	damage : function(){
		return this.number * WarheadDatabase[ this.type ].damage;
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
	
	_extend( this, setup );
}

Planet.extend( MovementModule );
Planet.extend({ 
	radius : 150, 
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
			
			var squaredRadius = entity
			
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
				
				unit.x -= unit.radius;
				unit2.x += unit2.radius;
				
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

			function cloneSpecifics( real, props ){
				var clone = {};
				
				for( var i = 0; i < props.length; ++ i ){
					var arg = props[i];
					clone[arg] = Math.floor( real[arg] );
				}
				return clone;
				
			}
					
			function appendUnit( legionId, unit ){
				if( unit.isDead() ) return;
				
				var data = cloneSpecifics( unit, ['x','y','vx','vy','type']);
				data["legion"] = legionId;
				
				output.units.push( data );
			}
			
			function appendHead( legionId, head ){
				if( head.isOutOfFuel() ) return;
			
				var data = cloneSpecifics( head, ['x','y','vx','vy','type']);
				data["legion"] = legionId;
				
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
					if( unitCollide( legion.units[i], _static ) ){
						legion.units.splice( i, 1 );
						break;
					}
				}
			// warheads against statics
				for( var i = legion.warheads.length; i --;  ){
					if( unitCollide( legion.warheads[i], _static ) ){
						legion.warheads.splice( i, 1 );
						break;
					}
				}

			}
			
		}
		
		// WARNING : Collision System hasn't been tested
		// TEST 1  : No error has been detected
		
		/** Collision Avoidance system
		 *  -> Avoidance system is applied to only static objects
		 *  -> Dynamic objects such as warheads are not worth avoiding b/c you pretty much cannot avoid them 
		 *  -> Another unit whether they are friend or foe aren't considered collided when they overlap 
		 *     so there is no need to prevent collision since there will be no collisions
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
						pDistance( ahead_x, ahead_y, _static.x, _static.y ) < _static.radius ||
						pDistance( ahead2_x, ahead2_y, _static.x, _static.y ) < _static.radius 
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
					console.log( mostThreatening );
					var MAX_AVOID_FORCE = unit.amax / 10;
					var avoidance_force = normalize({ x : ahead_x - mostThreatening.x, y : ahead_y - mostThreatening.y});

					this.ax += avoidance_force.x * MAX_AVOID_FORCE;
					this.ay += avoidance_force.y * MAX_AVOID_FORCE;

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
}


var GalaxyOne = new Galaxy( 5000, 5000 );

var redlegion = GalaxyOne.addLegion( "red" );


var unitone = redlegion.addUnit( new Spaceship({ x : 1000, y : 800, type : UnitType.mothership, number : 300 }) );
var unitwo = redlegion.addUnit( new Spaceship({ x : 200, y : 180, type : UnitType.destroyer, number : 200 }) );



unitone.on('under-attack', function(){
	console.log("I am hit !");
});

unitone.on('death', function(){
	console.log( " Me death");
});

var blueLegion = GalaxyOne.addLegion( "blue" );


fune = blueLegion.addUnit( new Spaceship({ x : 1000, y : 1000, number : 10000, type : UnitType.spy }) );
blueLegion.addUnit( new Spaceship({ x : 3000, y : 1000, type : UnitType.spy }) );

fune.moveTo( 0, 0 );

setInterval( function(){
	console.log( fune.x, fune.y );
	console.log( fune.vx, fune.vy );
}, 1000 );


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
GalaxyOne.addPlanet( new Planet({ x : 2500, y : 2500 }) );


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
var app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server, {log : false});


server.listen(9414);

app.use('/codex/', express.static(__dirname + '/codex/'));
app.use('/images/', express.static(__dirname + '/images/'));

app.get('/', function (req, res) {
	res.sendfile(__dirname + '/index.html');
});



 /****************************************************
 *  Networking Modules
 *  
 *  -> Data keeper
 *  -> broadcast data as necessary
 ****************************************************/

io.on('connection', function( socket ){
/*
redlegion.issueCommand({
	uid : unitwo.uniqueId(), 
	cid : 1, 
	tid : fune.uniqueId(), 
	tlegion : blueLegion.id
});
*/

	var secret = Math.floor( Math.random() * 1000000 );
	var legion = redlegion; // will be setup by connection later on
	
	socket.emit('identification', { id : secret } );
	socket.on('identification', function(name){
		socket.set('name', name );
	});
	
	socket.on('message', function( data ){
		socket.get('name', function( err, name ){
			if( err ) return socket.emit('name hasn\'t been set yet');
			io.sockets.emit('broadcast', {sender : name, message : data} );
		});
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
	callEvery( updateState, 50);
	updateState();
});


/*
	WORK FLAG : on the socket authentication and routing system
*/
 
 
