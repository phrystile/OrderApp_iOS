/*	HELPER CLASSES	*/
Template7.registerHelper('orderwhen', function (when,options) {
	var ret = new moment.utc(when);
	var nowutc = new moment.utc();

	return  ret.to(new Date(nowutc.local().format()));
});

Template7.registerHelper('orderwhenPast', function (when,options) {
 	var ret = new moment(when);
	var nowutc = new moment(new Date());

	return  ret.from(new Date(nowutc.utc().format()));
});

Template7.registerHelper('formatnice', function (when,options) {
	return new moment(when).format('dddd, MMMM Do YYYY, h:mm:ss a');
});

Template7.registerHelper('isFuture', function (when, options) {
	var d = new Date();

	if( d < when ) 
		return options.fn(this);
	else 
		return options.inverse(this);
});

Template7.registerHelper('isPast', function (when, options) {
	var d = new Date();

	if( d > when )
		return options.fn(this);
	else 
		return options.inverse(this);
});

Template7.registerHelper('firstletter', function(n, options) {
	if (typeof n === 'function') n = n.call(this);

	if (!n ) 
		return '?';
	else
		return n;
});

Template7.registerHelper('showCompletedOrders', function(n, options) {
	return localStorage.getItem('showCompletedOrders') == 'true' ? "checked=checked" : "";
});

Template7.registerHelper('stringify', stringifyHelper);

Template7.registerHelper('shortFormat', function(when, options) {
	return formattedWhen(when);
});

Template7.registerHelper('mobileBadge', function(contact, options) {
	if (contact.isUser) { 
		if (contact.mobileOS.toLowerCase() == 'ios') {
			return " <i class='fa fa-mobile-phone fa-2x' style='color:green'></i><img src='img/apple_badge.png' class='mobilebadge' >";
		}
		else if (contact.mobileOS.toLowerCase() == 'android') {
			return " <i class='fa fa-mobile-phone fa-2x' style='color:green'></i><img src='img/android_badge.png' class='mobilebadge' >";
		}
	}
	else {
		return ' <i class="fa fa-mobile-phone fa-2x" style="color:red"></i>' 
	}
});
/*	END HELPERS	*/

//Initialize app
var myApp = new Framework7({
	name : 'orderApp',
	template7Pages: true,
	precompileTemplates: true,
	swipeBackPage: true,
	animateNavBackIcon: false,	
	material :false,
	pushState: !!Framework7.prototype.device.os,
});

//Create DOM Instance
var $$ = Dom7;

//Set Device Type
var isIos = Framework7.prototype.device.ios === true;
//Create Push Notification object
var push;
//renderPage Object
var thisPage;

//Global Arrays
var orderData = {};
var userData = {};
var contactData  = {};
var currentOrder = {};

//Default Login State
userData.isLoggedOut = false;

//Build Side Panel Object
var sidePanelT = Template7.compile($$('#sidepanelTemplate').html());

//Setup Main View
var mainView = myApp.addView('.view-main', {
	dynamicNavbar: true
});

//On Device Ready Event Handler
$$(document).on('deviceready', function() {
	console.log("Device is ready!");

	if (userData.isLoggedOut)
		myApp.loginScreen();
	
	setupNotifications();
});

/* LOGIN EVENT HANDLERS */
$$('.btnLogin').on('click', function() { 
	myApp.closePanel(); 
	myApp.loginScreen(); 
});

$$('.btnSignIn').on('click', function() {
	if (!$$('#frmSignIn')[0].checkValidity()) { 
		myApp.alert('Email or Password was invalid/empty, try again!', 'Oops');
		return false;
	}

	myApp.showPreloader();
	var loginUrl = 'https://orderapp-api.herokuapp.com/users/login';
	var email = $$('#email').val();
	var password = $$('#password').val();

	var formdata = {};
	formdata.email = email;
	formdata.password = password;

	$$.post(loginUrl, formdata, 
		function(res, status,x) {
			if (typeof(res)== 'string') res = JSON.parse(res);

			myApp.hidePreloader();
				
			if (res.message != 'null' && res.status == '200') { 
				var data = res.message;
					
				userData = data;
				localStorage.setItem('userData', JSON.stringify(data));

				userData.isLoggedOut = false;
				myApp.closeModal('.login-screen',true);

				tryLogin();
			}
			else { 
				userData.isLoggedOut = true;
				myApp.alert('Login Failed', 'Oopsie.');
			}
		}, 
		function(error) {
			console.log('error' + error);
		}
	);
});

$$('.btnSignUp').on('click', function() {
    if (!$$('#frmSignIn')[0].checkValidity()) { 
		myApp.alert('Email or Password was invalid, try again!', 'Oops');
		return false;
	}
	
	var email = $$('#email').val();
	var password = $$('#password').val();
	
	myApp.showPreloader();
	isEmailInUse(email, password);
});

/* INITIALIZE PAGES */
//Build Orders Page
myApp.onPageInit('orders', function (page) {  
	currentOrder = {};
	
	var ptrContent = $$('.pull-to-refresh-content');
	
	ptrContent.on('refresh', function (e) {
		getOrdersByUser();
	});  

	$$('.btnOrderComplete').on('click', function() {
		var id = $$(this).data('id');
		markOrderComplete(id, $$(this));
	});

	$$('.btnOrderDelete').on('click', function() {
		var id = $$(this).data('id');
		markOrderDeleted(id, $$(this) );
	});

	$$('.btnNewOrder').on('click', function() {
		mainView.router.load({
			template: myApp.templates.newOrder,
		});	
	});

	$$('.addContacts').on('click', function() {
		currentOrder = JSON.parse($$(this).data('context'));
		console.log('addContacts');
		SyncContacts(false, function() { loadExistingOrderContacts(currentOrder); });
	});

	$$('#showCompletedOrders').on('change', function() {
		localStorage.setItem('showCompletedOrders', $$(this).prop('checked') );
		getOrdersByUser();
	});

	$$('.showReNotify').on('click', function() {
		if ($$(this).data('show') == 'reNotify') {
			$$(this).data('show','cancelReNotify');
			showReNotify($$(this).data('id'));
			$$('.notifyContact:checked').each(function() { $$(this).prop('checked', false) })
		}
		else {
			$$(this).data('show','reNotify');
			hideReNotify($$(this).data('id'));
		}
	});

	$$('.notifyContact').on('change', function() {
		var thisid = $$(this).data('orderid');
		if ($$('.notifyContact:checked').length > 0 && $$('.cancelReNotify.forId_' + thisid).css('display') == 'block') {
			 $$(".sendableReNotify.forId_" + thisid).show();
		 	console.log('$$(".sendableReNotify.forId_' + thisid + '").hide();');
		} 
		else { 
			$$(".sendableReNotify.forId_" + thisid).hide();
			 console.log('$$(".sendableReNotify.forId_' + thisid + '").hide();');
	 	}
	});

	$$('.cancelReNotify').on('click', function() {
		var thisid = $$(this).data('id');
		$$(".sendableReNotify.forId_" + thisid).hide();
		$$('.notifyContact:checked').each(function() { $$(this).prop('checked', false) })
	});

	$$('.sendableReNotify').on('click', function() {
		var thisid = $$(this).data('id');
		var totalNotifications = $$('.notifyContact:checked').length;
		var when = $$(this).data('when');
		var where =  $$(this).data('where');
		currentOrder.timeGoing = when;
		currentOrder.location = where;

		myApp.confirm('Resend ' + totalNotifications + ' Notifications?', 'Notifications', function() {
			var notify = {};
			notify.contacts = [];

			$$.each( $$('.notifyContact:checked'), function(a,b) {
				var tmpc = JSON.parse($$(b).data('contact') );
				notify.contacts.push(tmpc.contactDetail) ;
			});

			var tmpWhen = new moment(when);
				
			myApp.modal({
				title:  'Notify via Email or SMS',
				buttons: [
					{
						text: 'Email',
						onClick: function() {
							notify.contacts.forEach(function(c) {
							Notify(currentOrder, c, 'email' );
						});
							$$('.sendableReNotify').hide();
						getOrdersByUser();
						}
					},
					{
						text: 'SMS',
						onClick: function() {
							notify.contacts.forEach(function(c) {
							Notify(currentOrder, c, 'sms' );
							});
							$$('.sendableReNotify').hide();
						getOrdersByUser();
						}
					}
				]
			});				
		});
	});	
});

//Build New Order Page
myApp.onPageInit('newOrder', function(page) {
	setPicker();

	$$('#btnSelectContacts').on('click', function() {
		if ( $$('#location').val() == '') { 
			myApp.alert('Where tho?', 'Uhm');
			return false;
		}

		currentOrder.location = $$('#location').val();
		currentOrder.timeGoing = $$('#picker-input').val();
		loadContactsByUser();
	});
});

//Build Confirm Order Page
myApp.onPageInit('confirmOrder' , function(page) {
	thisPage = page;

	$$('#addphone').on('click', function() {	
		var thisContact = JSON.parse($$(this).data('contact'));
		var thisIndex = $$(this).data('index');

		myApp.prompt('Enter Number', 'Update', function (value) {
			thisContact.phone = value;

			$$(this).data('contact', JSON.stringify(thisContact));
			
			currentOrder.contacts[thisIndex].contact_id.phone = value;

			var phone = {"phone": value};
			updateUser(currentOrder.contacts[thisIndex].contact_id._id, JSON.stringify(phone), false);
		});
	});

	$$('#btnOrderConfirmed').on('click', function() {
		for (var i = 0 ; i < currentOrder.contacts.length ; i++) {
			currentOrder.contacts[i].contact_id.preferredMethod = [];
			for (var j = 0 ; j < $$('[data-id="' + currentOrder.contacts[i].contact_id._id + '"]').length ; j++ ) {
            	if ($$($$('[data-id="' + currentOrder.contacts[i].contact_id._id + '"]')[j]).prop('checked'))  {
					if ($$($$('[data-id="' + currentOrder.contacts[i].contact_id._id + '"]')[j]).hasClass('pref_email')) 
						currentOrder.contacts[i].contact_id.preferredMethod.push('EMAIL');
					if ($$($$('[data-id="' + currentOrder.contacts[i].contact_id._id + '"]')[j]).hasClass('pref_sms'))
						currentOrder.contacts[i].contact_id.preferredMethod.push('SMS');
				}
			}
		}

		var gmtWhen = new moment(currentOrder.timeGoing);

		if (thisPage.fromPage.name != 'existingOrderContacts') {
			createOrder(userData._id, currentOrder, gmtWhen.utc().format('YYYY-MM-DD H:mm'));		
		}

		loadOrdersPage();
	});
});

//Build View Contacts Page
myApp.onPageInit('viewContacts', function(page) {
	thisPage = page;

	//Setup Delete Button
	$$('.btnContactDelete').on('click', function() {
   	 $$.ajax({ type: "DELETE",
			url: 'https://orderapp-api.herokuapp.com/contacts/' + userData._id + '/' + $$(this).data('id'),
			success : function(res, success, x) { 
				if (typeof(res) == 'string') res = JSON.parse(res);

				if (res.status == '200') {
					SyncContacts(false)
				} 
				else {
					myApp.alert('Could not delete contact, try again later.', 'OrderApp');
				}
			},
			error : function(err) { console.log(err); }
		});
  	 });
});

//Build Order Contacts Page
myApp.onPageInit('orderContacts', function(page) {
   thisPage = page;

   $$('.btnContactDelete').on('click', function() {
   	 $$.ajax({ type: "DELETE",
			url: 'https://orderapp-api.herokuapp.com/contacts/' + userData._id + '/' + $$(this).data('id'),
			success : function(res, success, x) { 
				if (typeof(res) == 'string') res = JSON.parse(res);

				if (res.status == '200') {
					SyncContacts(false)
				} 
				else {
					myApp.alert('Could not delete contact, try again later.', 'OrderApp');
				}
			},
			error : function(err) { console.log(err); }
		});
  	 });

   $$('#btnConfirmOrder').on('click', function() {
		var orderEntryContacts = [];
		currentOrder.contacts = [];

		$$('.notifyContact:checked').each(function(a,b) {
			currentOrder.contacts.push( JSON.parse($$(b).data('contact')) );
		});

		for(var i = 0; i < currentOrder.contacts.length ; i++ ) { 
			currentOrder.contacts[i].contact_id.new = true; 
		}
		
		loadConfirmOrderPage();	
	});	
	
   	$$('.notifyContact').on('change', function() {
		var thisid = $$(this).data('orderid');

		if ($$('.notifyContact:checked').length > 0 ) {
			$$('#dvConfirmOrder').css('visibility','visible');
		} 
		else {
			$$('#dvConfirmOrder').css('visibility','hidden');
		}
	});
});

//Build Existing Order Contacts Page
myApp.onPageInit('existingOrderContacts', function(page) {
	$$('.notifyContact:checked').each(function() { 
		$$(this).prop('checked', false) 
	});

	$$('.btnExistingOrderSave').on('click', function() {
		var m = page.context;

		//TODO :MAKE GLOBAL EMAIL TEMPLATES
		var cx = [];
	
		$$('.notifyContact:checked').each(function() {
			var c = {};
			var thisContact = JSON.parse($$(this).data('contact'));
			c.contactId = thisContact.contact_id._id;
			c.contactOrder = 'Waiting for a response...';
			c.email = thisContact.contact_id.email;
			c.name = thisContact.contact_id.name;
			c.phone = thisContact.contact_id.phone;
			thisContact.contact_id.new = true;
			createOrderEntry(m.currentOrder._id, c );
			currentOrder.contacts = [];
			currentOrder.contacts.push(thisContact);
		});

		loadConfirmOrderPage();
	});

	$$('.notifyContact').on('change', function() {
		var thisid = $$(this).data('orderid');
	
		if ($$('.notifyContact:checked').length > 0 ) {
			$$('.paperplane').css('visibility','visible');
		} 
		else {
			$$('.paperplane').css('visibility','hidden');
		}
	});
});

//Buid New Contact Page
myApp.onPageInit('newContact', function(page) {
	console.log(page);
	
	myApp.closePanel();

	$$('#btnImportContacts').on('click', function() {
		loadContacts();
	});

	$$('.btnNewContact').on('click', function() {
		var ncontact = {};
		ncontact.name = {};
		ncontact.name.firstname = $$('#newContact_FirstName').val();
		ncontact.name.lastname = $$('#newContact_LastName').val();
		ncontact.email = $$('#newContact_Email').val();
		ncontact.phone = $$('#newContact_Phone').val();

		createContact(ncontact, page);
	});
});

//Build Import Contacts Page
myApp.onPageInit('importContact', function(page) {
	$$('#btnImportSelectedContacts').on('click', function() {
		console.log( $$('.selectedContact:checked').data('contact')  );

		var cts = new Array();
		$$.each($$('.selectedContact:checked'), function(a,b) {
			cts.push( JSON.parse( $$(b).data('contact') ));
		});

		saveImportContactsToUser(cts);
	});
});

//Build Notification Alert Page
myApp.onPageInit('NotificationAlert', function(page) {
	$$('#btnReplyYes').on('click', function() {
		$$('#notifyreply').show(); 
	});

	$$('#btnReplyNo').on('click', function() {
		var reply = JSON.parse($$(this).data('additionaldata')).additionalData;	
		$$('#notifyreply').hide(); 
		AcceptOrder(false, { additionalData : reply});
	});

	$$('#btnAcceptOrder').on('click', function() {
		var reply = JSON.parse($$(this).data('additionaldata')).additionalData;
		reply.inlineReply = $$('#txtNotificationReply').val();			
		AcceptOrder(true, { additionalData : reply });
	});
});

/* END INITIALIZE PAGES */

/*	APP START	*/
tryLogin();
/*	END APP START	*/

/*	FUNCTIONS	*/

/******TEST ONLY*******/
function LoadTest() {
	myApp.showPreloader();

	$$.getJSON('https://orderapp-api.herokuapp.com/orders/5925b469131ccd0004c87ef2', function(res, status, x) { 
		if (typeof(res) == 'string') res = JSON.parse(res); 
		
		console.log(res);
		
		myApp.hidePreloader();
		
		if (res.status == '200') {
			currentOrder = res.message;
			embedContactDataToCurrentOrder();
			
			LoadNotificationPage(null);
		}
		else { 
			myApp.alert('Could not load Order, try again later', 'OrderApp'); 
		}
	});
}
/******TEST ONLY*******/

/* HELPER FUNCTIONS */
//Stringify Helper
function stringifyHelper(context) {
	if (context) {
		var str = JSON.stringify(context);
		return str.replace(/"/g, '&quot;');
	}
}

//Build Side Panel wtih User Data from Memory
function renderSidePanel() {
	$$('.sidepaneldiv').html(sidePanelT(JSON.parse(localStorage.getItem('userData'))));
}

//Build Date/Time Picker 
function setPicker() {
	var startDate = new moment(new Date);
	startDate.add(2, 'H');

	var curMinute = startDate.minute();
	var closestMin = '00';

	if (curMinute < 15) 
		closestMin = '45';
	else if (curMinute >=15 && curMinute < 30) 
		closestMin == '15';
	else if (curMinute >=30 && curMinute < 45) 
		closestMin == '30'
	else if (curMinute < 15 && curMinute > 45) 
		closestMin == '00';

	var myPicker = myApp.picker({
		value : [ 
			(function() { return startDate.format('YYYY-MM-DD '); })(), 
			(function() { return startDate.format('H'); })(),
			(function() { return closestMin })(),
		],
		formatValue : function(myPicker, values, Displayvalues) {
			var hour = parseInt(values[1]);

			if (values[3]  == 'PM' && hour == 12) 
				hour = 12;
			else if (values[3] == 'AM' && hour == 12)
				hour = 0 ;
			else if ( hour < 12 && values[3] == 'PM')
				hour += 12;

			return values[0] + ' ' + hour.toString() + ':' + values[2];
		},
		input: '#picker-input',
		cols: [
			{
				displayValues : (function() {
					var today = new moment(new Date());

					var arr = [];
					arr.push('Today');
					arr.push('Tomorrow');
					today.add(1,'d');
					for (var i = 0 ; i < 7 ; i++) {
						arr.push(today.add(1, 'd').format('ddd DD'));
					}
					return arr;
				})(),
				values: (function() {
					var today = new moment(new Date());
					var arr = [];
					arr.push(today.format('YYYY-MM-DD'));
					arr.push(today.add(1, 'd').format('YYYY-MM-DD'));
					for (var i = 0 ; i < 7 ; i++) {
						arr.push(today.add(1, 'd').format('YYYY-MM-DD'));
					}
					return arr;
				})()
			},
			{	
				values: [12,1,2,3,4,5,6,7,8,9,10,11]
			}, 
			{
				values : ['00', '15', '30', '45']
			},
			{
				values : ['AM', 'PM']
			}
		]
	});
}

//Set Picker Value to current date/time
function pickerValNow() {
	var t = new moment(new Date());
	$$('#picker-input').val( t.format('YYYY-MM-DD H:mm') );
}

//Format Order When Date
function formattedWhen(when) { 
	console.log('going ' + new Date(when));
	console.log('now ' + new Date());

	var w = new moment(when);
	var now = new moment(new Date());
	var duration = moment.duration(w.diff(now));
	var hours = duration.asDays();
	var out;

	if (Math.ceil(hours) < 1) 
		out = 'Today';

	if (Math.ceil(hours) == 1) 
		out = 'Tomorrow';

	if (Math.ceil(hours) >=2) 
		out = w.format('dddd');

	return out + ' @ ' + w.format('hh:mm A');
}

//Toggle Theme
function toggleTheme() {
	if($$('body').hasClass('layout-dark'))
	{
		$$('body').removeClass('layout-dark');
		$$('body').removeClass('theme-green');
		$$('body').addClass('layout-white');
		$$('body').addClass('theme-blue');
	}
	else
	{
		$$('body').removeClass('layout-white');
		$$('body').removeClass('theme-blue');
		$$('body').addClass('layout-dark');
		$$('body').addClass('theme-green');
	}
}

//Go Home
function goHome() {
	getOrdersByUser();
}
/* END HELPERS */

/********************/

/* LOGIN FUNCTIONS */
//Login User
function tryLogin() {
	var storedUser = localStorage.getItem('userData');

	if (!storedUser) { 
		myApp.loginScreen(); 
		return;
	}
	
	userData = JSON.parse(storedUser);
	
	if (userData._id != '') { 	
		userData.isLoggedOut = false;
		renderSidePanel();

		if (!localStorage.getItem('contactData') || localStorage.getItem('contactData') == "[]" ) {
			SyncContacts();
		} 
		else {
			getOrdersByUser();
		}

		syncRegistrationId();
	} 
	else {
		userData.isLoggedOut = true;
		
		mainView.router.load({
			pageName: 'index',
			animatePages: false,
		});	
	}
}

//Logout User
function logout() {	
	userData.isLoggedOut=true;
	localStorage.removeItem('userData');
	localStorage.removeItem('orderData');

	tryLogin();
}

//Create New User
function signUpUser(email,password) {
	var newUser = { name : { firstname : "", lastname : ""}, email : email, phone : "", password : password, mobileOS: isIos ? 'iOS' : 'android' };

	$$.ajax({ 
		url : 'https://orderapp-api.herokuapp.com/users',
		data : JSON.stringify(newUser),
		type : 'POST', 
		contentType: "application/json",
		success: function(res, status, x) { 
			if (typeof(res) == 'string') res = JSON.parse(res);

			if (res.message != 'null' && res.status == '200') {
				userData = res.message;
				localStorage.setItem('userData', JSON.stringify(res.message));
				userData.isLoggedOut = false;
				myApp.closeModal('.login-screen',true);
				tryLogin();
			} 
			else {
				userData.isLoggedOut = true;
				myApp.alert('Login Failed', 'Oopsie.');	
			}
		},
		error: function(err) { console.log(err); }
	});
}

//Check if Email is Already in Use
function isEmailInUse(email,password) { 
	$$.getJSON('https://orderapp-api.herokuapp.com/users/verify/' + email, function(res, status, x) { 
		if (typeof(res) == 'string') 
			res = JSON.parse(res);  
		
		canSignUp(email,password,res.result); 
	});
}

//Validate Whether Email is Already in Use
function canSignUp(email, password, result) {
	myApp.hidePreloader();

	if (result)  { 
		myApp.alert('Email is in use, try again', 'Oops');
	} 
	else {
		signUpUser(email,password);
	}
}

//Update User Record with Push Notificaiton Registration ID
function syncRegistrationId() {
	var regData = {};

	regData.registration_id = localStorage.getItem('registrationId');

	if (userData.registration_id !== regData.registration_id) {
		$$.post('https://orderapp-api.herokuapp.com/users/' + userData._id, regData, function(res, status, x) {
			if (typeof(res) == 'string') res = JSON.parse(res);
		});
	}
}
/* END LOGIN */

/********************/

/* ORDER FUNCTIONS */

//Update OrderEntry based on User's reply
function AcceptOrder(blAccepted, objData) {
	//Push Notification Finish Event Handler
	push.finish(function() {console.log('pushsuccess')}, function() {console.log('pushfailed')});

	var orderid = objData.additionalData.orderid; 
	var contactid = objData.additionalData.contactid;
	var orderEntryId = objData.additionalData.orderentryid;
	var orderEntry;

	if(blAccepted)
		orderEntry = { contactOrder : objData.additionalData.inlineReply };
	else
		orderEntry = { contactOrder : 'Nothing' };

	updateOrderEntry(orderid, orderEntryId, orderEntry, true);
}

//Get Order by ID from Database
function LoadOrderbyId(id, fwd = false, callback = function() {}) {
	myApp.showPreloader();

	$$.getJSON('https://orderapp-api.herokuapp.com/orders/' + id , function(res, status, x) { 
		if (typeof(res) == 'string') res = JSON.parse(res); 
		
		console.log(res);
		
		myApp.hidePreloader();
		
		if (res.status == '200') {
			currentOrder = res.message;
			embedContactDataToCurrentOrder();
			if (fwd) callback.call();
		}
		else { 
			myApp.alert('Could not load Order, try again later', 'OrderApp'); 
		}
	});
}

//Get List of Orders from Database for User
function getOrdersByUser() { 
	myApp.showIndicator();

	var showAll = localStorage.getItem("showCompletedOrders") == 'true' ? 'All' : '';
	
	var url = 'https://orderapp-api.herokuapp.com/orders/' + userData._id + '/timeGoing/1/' + showAll;
	
	$$.getJSON(url, function(res, status, x) {
		if (typeof(res) == 'string') res = JSON.parse(res);
		
		myApp.hideIndicator();
	
		if (res.status =='200' )  {
			orderData = res.message; 
			localStorage.setItem('orderData', JSON.stringify(res.message));
			embedContactDataToOrders();
			loadOrdersPage();
		 }
	});
}

//Create OrderEntry in Database
function createOrderEntry(orderId, orderEntry, fwd = false) {
	myApp.showPreloader()

	$$.post('https://orderapp-api.herokuapp.com/orderentry/' + orderId, orderEntry,  function(res,status,x) {
		myApp.hidePreloader();

		if (typeof(res) =='string') res = JSON.parse(res);
		
		console.log('createorderentry response: ' + JSON.stringify(res))
		
		if (res.status != '200') {
			myApp.alert('There was a problem with creating an order entry, please try again later.', 'OrderApp');
			return;
		}

		if (fwd) { getOrdersByUser(); }
	});	
}

//Update OrderEntry in Database
function updateOrderEntry(orderId, orderEntryId, orderEntry, fwd = false) {
	$$.post('https://orderapp-api.herokuapp.com/orderentry/' + orderId + '/' + orderEntryId, orderEntry,  function(res,status,x) {
		if (typeof(res)=='string') res = JSON.parse(res);

		if (res.status != '200') {
			myApp.alert('There was a problem with creating an order entry, please try again later.', 'OrderApp');
			return;
		}

		if (fwd) { getOrdersByUser(); }
	});	
}

//Inform User of Order Request
function updateUser(id, user, fwd=false) {
	$$.post('https://orderapp-api.herokuapp.com/users/' + id, JSON.stringify(user),  function(res,status,x) {
		if (typeof(res)=='string') res = JSON.parse(res);

		if (res.status != '200') {
			myApp.alert('Something went wrong, please try again later.', 'OrderApp');
			return;
		}

		if (fwd) { loadConfirmOrderPage(); }
	});	
}

//Create Order
function createOrder(who, order, when) {
	myApp.showPreloader('Creating Order..');
	
	var notify = [];
	
	order.contacts.forEach(function(c) {
		notify.push({contactId : c.contact_id._id, contactOrder : 'Waiting for a response...'});
	});

	var toPost = {"userId" : who, "location" : order.location , "timeGoing" :when, "orderEntry" : notify};
	
	$$.ajax({ 
		url : 'https://orderapp-api.herokuapp.com/orders',
		data : JSON.stringify(toPost),
		type : 'POST', 
		contentType: "application/json",
		success: function(res, status, x) { 
			if (typeof(res) =='string') res = JSON.parse(res);
			
			myApp.hidePreloader();

			if (res.status == '200') {
				var preCurrentOrder = order;
				currentOrder = res.message;
				
				embedContactDataToCurrentOrder();
				
				preCurrentOrder.orderEntry = currentOrder.orderEntry;
				preCurrentOrder._id = res.message._id;

				preCurrentOrder.contacts.forEach(function(c) {
					if (c.contact_id.isUser && c.contact_id.registration_id != '') {
						Notify(preCurrentOrder, c.contact_id, 'app');
					}
					else {
						c.contact_id.preferredMethod.forEach(function(p) {
							if (p.toLowerCase() == 'email') { 
								Notify(preCurrentOrder, c.contact_id, 'email' );
							}
							else if (p.toLowerCase() == 'sms') { 
								Notify(preCurrentOrder, c.contact_id, 'sms' );
							}
						});
					}
				});

				getOrdersByUser();
			} 
			else {
				myApp.alert('There was a problem creating the order, please try again later', 'OrderApp');
				getOrdersByUser();
			}
		},
		error: function(err) { console.log(err); }
	});
}

//Update Order with new Entry
function updateOrder(id, order) {
	$$.post('https://orderapp-api.herokuapp.com/orders/' + id, order, function(res, status, x) {
		if (typeof(res) == 'string') res = JSON.parse(res);
		
		loadOrdersPage();		
	});
}

//Mark Order Complete
function markOrderComplete(id, el) {
	$$.post('https://orderapp-api.herokuapp.com/orders/' + id, {'isCompleted': true}, function(res,status,x) { 
		if(typeof(res) == 'string') res = JSON.parse(res);
		
		if (res.status == '200') {
			getOrdersByUser();
		} 
		else {
			myApp.alert('Oops, Could not mark complete, try again later', 'OrderApp');
		}
	});
}

//Delete Order
function markOrderDeleted(id, el) {
	$$.ajax({ type: "DELETE",
		url: 'https://orderapp-api.herokuapp.com/orders/' + id,
		success : function(res, status, x) {  
			if (typeof(res) == 'string') 
				res = JSON.parse(res); 
			
			console.log(res); 
		
			getOrdersByUser() 
		},
		error : function(err) { console.log(err); }
	});
}

//Load Order Page
function loadOrdersPage() {
	mainView.router.load({
		template: myApp.templates.orders, 
		animatePages: false,
		context: {orders : orderData},
		reload: true
	});	
	
	myApp.hidePreloader();
	myApp.pullToRefreshDone();
}

//Load Order Detail Page
function loadOrderDetailPage() {
	mainView.router.load({
		template: myApp.templates.orderDetail, 
		animatePages: true,
		context: {currentOrder : currentOrder}
	});	
}

//Load Order Confirmation Page
function loadConfirmOrderPage() {
	mainView.router.load({
		template: myApp.templates.confirmOrder, 
		animatePages: false,
		reload: true,
		context: {currentOrder: currentOrder }
	});
}
/* END ORDERS */

/********************/

/* NOTIFICATION FUNCTIONS */
//Setup Push Notification
function setupNotifications() {
	push = PushNotification.init({
		"android": {
			"senderID": "1074585851527"
		},
		"browser": {},
		"ios": {
            "senderID": "1074585851527",
            "gcmSandbox": true,
			"sound": true,
            "alert": true, 
			"vibration": true,
			"badge": true
		},
		"windows": {}
	});

	//Push Notification Registertion Event Handler
	push.on('registration', function(data) {
		console.log('registration event: ' + data.registrationId);
		
		//Subscribe to Push Notifications
		push.subscribe('everyone', subSuccess, subFail);
		
		localStorage.setItem('registrationId', data.registrationId);
	});
	
	//Push Notifcation Error Event Handler
	push.on('error', function(e) {
		console.log("push error = " + e.message);
	});

	//Push Notification Event Handler
	push.on('notification', function(data) {
		//Load Order based on Notification type
		if (data.additionalData.type == "neworder") {
			LoadOrderbyId(data.additionalData.orderid, true, function() { LoadNotificationPage(data.additionalData) });
		}
		else if (data.additionalData.type == "update") {
			loadOrdersPage();		
		}
	});
}

//Push Notification Subscribtion Succeeded
function subSuccess(d) {
	console.log(d);
}

//Push Notification Subscribtion Failed
function subFail(err) {
	console.log(err);
}

//Notify Class Object
function notifyObj() {
	this.pushType = "",
	this.who = "",
	this.where =  "",
	this.when =  "",
	this.email =  "",
	this.sms = "",
	this.registrationId = "",
	this.orderId = "",
	this.contactId =""
}

//Setup Notification Object
function _notify(order, contact, type) {
	//this.url = 'https://orderapp-api.herokuapp.com/notify/';
	
	var n = new notifyObj();
	n.who = userData.name.firstname + ' ' + userData.name.lastname;
	n.where = order.location;
	n.when = formattedWhen(order.timeGoing);
	n.orderId = order._id;
	n.contactId = contact._id;
	n.orderEntryId = currentOrder.orderEntry.find(function(b) { return b.contactId == contact._id })._id;
	n.pushType = type;

	if (n.pushType == 'email') {
		n.email = contact.email || contact.contactDetail.email;
	} 
	else if ( n.pushType == 'sms') {
		n.sms = contact.phone || contact.contactDetail.phone;
	}
	
	n.registrationId = contact.registration_id || '';
			
	sendNotification(n);
}

//Send Notification
function sendNotification(data) {
	$$.post('https://orderapp-api.herokuapp.com/notify/', 
		data,
		function(res,status, x) {
			if (typeof(res) == 'string') res = JSON.parse(res);

			if (res.status != '200') {
				myApp.addNotification({title: "Failed To Notify " + contact.name.firstname, hold : 1200});
			}
		}
	);	
}

/*function Notify(order, contact, type) { 
	var p = new _notify(order,contact,type);
}*/

//Display Notification
function LoadNotificationPage(d) {
	mainView.router.load({
		template: myApp.templates.NotificationAlert, 
		animatePages: false,
		context: { 
			currentOrder : currentOrder, 
			additionalData: d 
		}
	});
}

//Show Re-Notify
function showReNotify(id) {
	console.log(id);

	$$('.notifyCheckboxes.forId_' + id).show(); 
	$$('.cancelReNotify.forId_' + id).show();
	$$('.reNotify.forId_' + id).hide();
}

//Hide Re-Notify
function hideReNotify(id) {
	console.log(id);

	$$('.notifyCheckboxes.forId_' + id).hide(); 
	$$('.cancelReNotify.forId_' + id).hide();
	$$('.reNotify.forId_' + id).show();
}
/* END NOTIFICATION */

/********************/

/* CONTACT FUNCTIONS */
//Import Contacts from Device
function loadContacts() {
	myApp.showPreloader();
	var options = new ContactFindOptions();
	options.multiple=true;
	var fields = ["displayName", "name", "emails", "phonenumbers"];

	navigator.contacts.find(fields, onContactFindSuccess, onContactFindError, options);
}

//Contacts Found
function onContactFindSuccess(contacts) {
	myApp.hidePreloader();
	myApp.closePanel();

	prop = 'displayName';

	contacts = contacts.sort(function(a, b) {
		return (a[prop] > b[prop]) ? 1 : ((a[prop] < b[prop]) ? -1 : 0);
	});

	loadImportContactsPage(contacts);
}

//Contacts Lookup Error
function onContactFindError(contactError) {
	myApp.hidePreloader();
	myApp.closePanel();
	console.log('contact load fail' + contactError);
}

//Load Imported Contacts into Page
function loadImportContactsPage(c) {
	mainView.router.load({
		template: myApp.templates.importContact, 
		animatePages: false,
		context: {contacts : c}
	});	
}

//View Contacts Page
function viewContacts() {
	myApp.closePanel();
	
	contactData = JSON.parse(localStorage.getItem('contactData'));
	
	mainView.router.load({
		template: myApp.templates.viewContacts, 
		animatePages: false,
		reload: false,
		context: {contacts : contactData }	
	});	
}

//Load Stored Contacts into Page
function loadContactsPage() {
	myApp.closePanel();

	mainView.router.load({
		template: myApp.templates.orderContacts, 
		animatePages: false,
		reload: false,
		context: {contacts : contactData, selOrder: currentOrder }	
	});	
}

//Load Contacts from Memory
function loadExistingOrderContacts(currentOrder) {
	var availContacts = JSON.parse(localStorage.getItem('contactData'));
		
	for (var i = 0 ; i < availContacts.length ; i++ ) {
		for (var j = 0 ; j < currentOrder.orderEntry.length ; j++) {
			if (availContacts[i].contact_id._id == currentOrder.orderEntry[j].contactId ) {
				availContacts.splice(i,1);
			}
		}
	}

	mainView.router.load({
		context: {currentOrder : currentOrder, contacts : availContacts}, 
		template: myApp.templates.existingOrderContacts
	});
}

//Get Contacts from Database
function getContactsByUser() { 
	$$.ajax({type:'GET',
		url: 'https://orderapp-api.herokuapp.com/contacts/' + userData._id,
		success: function(res, status, x) {
			if (typeof(res) == 'string') res = JSON.parse(res);
			
			if (res.status == '200') {
				contactData = res.message;
				loadContactsPage(); 
			}
			else { 
				myApp.alert('There was a problem loading your contacts, try again later', 'OrderApp');
			}
		},
		error : function(Err) { 
			console.log(err); 
		}
	});
}

//Load Contacts from Memory
function loadContactsByUser() { 
	SyncContacts(false);
	contactData = JSON.parse(localStorage.getItem('contactData'));
	loadContactsPage(); 
}

//Write Imported Contacts to Database
function saveImportContactsToUser(contacts, page) {
	var cts = new Array();

	console.log('number of contacts ' + contacts.length);
	
	$$.each(contacts, function(a,b) {
		var con = {};
		con.name = {};
		con.name.firstname = b.name.givenName;
		con.name.lastname = b.name.familyName;
		con.email = b.emails  ? b.emails[0].value : '';
		con.phone = b.phonenumbers ? b.phonenumbers[0].value : '';
		cts.push(con);
	});

	createContact(cts, page);
}

//Create Contact in Database
function createContact(contact, page) {
	$$.ajax({ 
		url : 'https://orderapp-api.herokuapp.com/contacts/' + userData._id,
		data : JSON.stringify(contact),
		type : 'POST', 
		contentType: "application/json",
		success: function(res, status, x) { 
			if (typeof(res) == 'string') res = JSON.parse(res);

			if (page.fromPage.name == "existingOrderContacts") {
				SyncContacts(false, function() { loadExistingOrderContacts(page.context.currentOrder); });
			} 
			else if (page.fromPage.name.toLowerCase() == "orders") {
				SyncContacts(false, function() { loadOrdersPage(); });
			}
			else if (page.fromPage.name.toLowerCase() == "viewcontacts"){
				SyncContacts(false, function() { viewContacts(); });
			}
			else {
				getContactsByUser();
			}
		},
		error: function(err) { console.log(err); }
	});
}

//Write Contact Data to Order
function embedContactDataToOrders() {
	c = JSON.parse(localStorage.getItem('contactData'));
	
	for(var i = 0 ; i < orderData.length ; i++) {
		for(var j = 0 ; j < orderData[i].orderEntry.length  ; j++) {
			for (var k = 0 ; k < c.length  ; k++) {
				if (c[k].contact_id._id == orderData[i].orderEntry[j].contactId) {
					orderData[i].orderEntry[j].contactDetail = c[k];
				}
			}
		}
	}
}

//Write Contact Data to Current Open Order
function embedContactDataToCurrentOrder() {
	c = JSON.parse(localStorage.getItem('contactData'));
	
	for(var j = 0 ; j < currentOrder.orderEntry.length  ; j++) {
		for (var k = 0 ; k < c.length  ; k++) {
			if (c[k].contact_id._id == currentOrder.orderEntry[j].contactId) {
				currentOrder.orderEntry[j].contactDetail = c[k];
			}
		}
	}
}

//Sync in Memory Contacts with Database record
function SyncContacts(fwd = true, callback = function() {}) {
	$$.ajax({type:'GET',
		url: 'https://orderapp-api.herokuapp.com/contacts/' + userData._id,
		success: function(res, status, x) {
			console.log(res);
		
			if (typeof(res) == 'string') res = JSON.parse(res);
			
			if (res.status =='200') {
				contactData = res.message;
				contactData = contactData.sort(function(a,b) {return b.contact_id.isUser - a.contact_id.isUser});
				localStorage.setItem('contactData', JSON.stringify(res.message));
			
				if (fwd) { 
					getOrdersByUser(); 
				} else {
					callback.call()
				}
			}
		}
	});
}
/* END CONTACTS */

/********************/

/*	END FUNCTIONS	*/