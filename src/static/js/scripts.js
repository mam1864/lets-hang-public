const socket = io();

document.addEventListener("DOMContentLoaded", main);

function main() {
  console.log(window.location.pathname);
  if(window.location.pathname === "/friends") {
    let timeout = null;
    const searchbar = document.querySelector("#friendsearch");
    searchbar.addEventListener('keyup', function () {
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        handleSearch(searchbar);
      }, 500);
    });
    socket.on('search-result', handleResult);
    socket.on('sent-request', (e) => {
      const addfriendbutton = document.getElementById('addfriend');
      addfriendbutton.innerHTML = "request sent!";
      addfriendbutton.disabled = true;
    });
  }
  else if(window.location.pathname === "/account") {
    const usermsid = document.getElementById('usermsid').getAttribute('name');
    socket.emit('get-pending-requests',{msid:usermsid});
    socket.emit('get-friends', {msid:usermsid});
    const sharecal = document.getElementById('share-cal');
    sharecal.addEventListener('click', (e) => {
      e.preventDefault();
      socket.emit('update-cal', {usermsid:usermsid});
    });
    socket.on('updated-cal', () => {
      const updated = document.createElement('a');
      updated.style.color = "#0b3562";
      updated.innerHTML = 'Updated!';
      sharecal.parentNode.appendChild(updated);
      sharecal.parentNode.removeChild(sharecal);
    });
    socket.on('pending-requests', (e) => {
      const prbody = document.getElementById('pending-requests-body');
      const users = e.result;
      users.forEach((user) => {
        const button = document.createElement("div");
        button.setAttribute('data-toggle',"modal");
        button.setAttribute('data-target',"#profilecard");
        button.className = "search-result";
        const pcard = createProfileCard(user);
        button.appendChild(pcard);
        button.addEventListener('click', (e) => {
          showAccountPage(user);
        });
        prbody.appendChild(button);
      });
    });
    
    socket.on('accepted-request', (e) => {
      const addfriendbutton = document.getElementById('addfriend');
      addfriendbutton.innerHTML = "Friends";
      addfriendbutton.disable = true;
      socket.emit('get-pending-requests',{msid:usermsid});
    });

    socket.on('friends', (e) => {
      console.log("Friends:",e.result);
      const frbody = document.getElementById('friends-body');
      const users = e.result;
      users.forEach((user) => {
        const button = document.createElement("div");
        button.setAttribute('data-toggle',"modal");
        button.setAttribute('data-target',"#profilecard");
        button.className = "search-result";
        const pcard = createProfileCard(user);
        button.appendChild(pcard);
        button.addEventListener('click', (e) => {
          showAccountPage(user);
        });
        frbody.appendChild(button);
      });
    });
  }
  else if (window.location.pathname === "/calendar") {
    const usermsid = document.getElementById('usermsid').getAttribute('name');
    const frbody = document.getElementById('friends-body');
    socket.emit('get-friends',{msid:usermsid});
    socket.on('friends', (data) => {
      data.result.forEach((user) => {
        const inputlabeldiv = document.createElement('div');
        inputlabeldiv.className = "input-label-group";
        const checkbox = document.createElement('input');
        const label = document.createElement('label');
        checkbox.type = 'checkbox';
        checkbox.value = user.username;
        checkbox.id = user.msid;
        checkbox.value = user.msid;
        checkbox.setAttribute('form','new-event');
        checkbox.name = "friend";
        checkbox.addEventListener('click', (e) => {
          console.log("CLICKED CHECKBOX");
          const frnds = document.getElementsByName('friend');
          // replaced forEach loop here with ES6. This is probably slower, but satisfies requirement
          const msids = Object.values(frnds).filter((frnd) => frnd.checked).map((frnd) => frnd.id);
          msids.push(usermsid);
          socket.emit('get-events',{msids:msids});
        });
        label.setAttribute("for",user.msid);
        label.textContent = user.username;
        inputlabeldiv.appendChild(checkbox);
        inputlabeldiv.appendChild(label);
        frbody.appendChild(inputlabeldiv);
      });
    });
    socket.on('send-calendars', (data) => {
      const calbod = document.getElementById('calendar-body');
      calbod.innerHTML = '';
      // quickly thought up color coding system. TO-DO: show which color corresponds to which user in app
      const colors = ['blue','green','red','black','brown','purple'];
      const colorsDict = {};
      colorsDict[usermsid] = 'inherit';
      let colorIndex = 0;
      data.events.forEach((event) => {
        const row = document.createElement('tr');
        const sub = document.createElement('td');
        const start = document.createElement('td');
        start.className = 'dateTime';
        const end = document.createElement('td');
        end.className = 'dateTime';
        sub.textContent = event.subject;
        start.textContent = event.start.dateTime;
        end.textContent = event.end.dateTime;
        if (!(Object.keys(colorsDict).includes(event.msid))) {
          colorsDict[event.msid] = colors[colorIndex];
          colorIndex++;
        }
        row.style.color = colorsDict[event.msid];
        row.appendChild(sub);
        row.appendChild(start);
        row.appendChild(end);
        calbod.appendChild(row);
      });
    });
    socket.on('error_msg', (data) => {
      console.log(data);
    });
  }

  else if (window.location.pathname === "/calendar/new") {
    const usermsid = document.getElementById('usermsid').getAttribute('name');
    socket.emit('get-friends',{msid: usermsid});
    socket.on('friends', (data) => {
      createEmailSuggester(data.result);
      const attendeesInput = document.getElementById("attendees-input");
      attendeesInput.addEventListener('focus', (e) => {
        const emailsContainer = document.getElementById("emails-container");
        emailsContainer.style.display = "block";
        const nameEmailGroups = document.getElementsByName("name-email-group");
        nameEmailGroups.forEach(group => {
          const email = group.childNodes[1].textContent;
          const attendeesVal = attendeesInput.value;
          if (attendeesVal.includes(email)) {
            group.style.display = "none";
          }
          else {
            group.style.display = "inline-block";
          }
        });
      });
      attendeesInput.addEventListener('blur', (e) => {
        const emailsContainer = document.getElementById("emails-container");
        setTimeout(() => {
          emailsContainer.style.display = "none";
        }, 100);
      });
      
    });
  }
}

function createEmailSuggester(users) {
  const attendeesInput = document.getElementById("attendees-input");
  const emailsContainer = document.getElementById("emails-container");
  users.forEach((user) => {
    const nameEmailGroup = document.createElement('div');
    nameEmailGroup.className = "name-email-group";
    nameEmailGroup.setAttribute("name","name-email-group");
    nameEmailGroup.id = user.msid;
    const name = document.createElement('div');
    name.textContent = user.username;
    const email = document.createElement('div');
    email.textContent = user.email;
    nameEmailGroup.appendChild(name);
    nameEmailGroup.appendChild(email);
    nameEmailGroup.addEventListener('click', (e) => {
      if(attendeesInput.value === '') {
        attendeesInput.value = user.email;
      }
      else {
        attendeesInput.value = attendeesInput.value + ";" + user.email;
      }
      emailsContainer.style.display = "none";
    });
    emailsContainer.appendChild(nameEmailGroup);
  });
}

function handleResult(data) {
  console.log("USERS?",data.result);
  const users = data.result;
  const resultsdiv = document.getElementById("search-results");
  resultsdiv.innerHTML = '';
  users.forEach((user) => {
    const button = document.createElement("div");
    button.setAttribute('data-toggle',"modal");
    button.setAttribute('data-target',"#profilecard");
    button.className = "search-result";
    const pcard = createProfileCard(user);
    button.appendChild(pcard);
    button.addEventListener('click', (e) => {
      showAccountPage(user);
    });
    resultsdiv.appendChild(button);
  });
}

async function showAccountPage(currentuser) {
  const modalbody = document.getElementById("profilecardBody");
  modalbody.innerHTML = '';
  const pcard = createProfileCard(currentuser);
  modalbody.appendChild(pcard);
  const fcard = createFriendsCard([]);
  modalbody.appendChild(fcard);
  const requester = document.getElementById('usermsid').getAttribute('name');
  const requested = currentuser.msid;
  const addfriendbutton = document.getElementById('addfriend');
  socket.emit('check-already-added', {to:requested,from:requester});
  socket.on('check-already-added-result', (e) => {
    console.log("RESULT",e.details);
    if (e.details === "validrequest") {
      addfriendbutton.disabled = false;
      addfriendbutton.innerHTML = 'Add friend';
      addfriendbutton.addEventListener('click', (e) => {
        socket.emit('send-request', {from:requester, to:requested});
      });
    }
    else if (e.details === "self") { // is your own account
      addfriendbutton.disabled = false;
      const linktoMyAcc = document.createElement('a');
      linktoMyAcc.innerHTML = 'My Account';
      linktoMyAcc.href = '/account';
      linktoMyAcc.className = 'linktoaccfromfriends';
      addfriendbutton.innerHTML = '';
      addfriendbutton.appendChild(linktoMyAcc);
    }
    else if (e.details === "mutual") { // received a request from this account
      addfriendbutton.disabled = false;
      addfriendbutton.innerHTML = 'Accept';
      addfriendbutton.addEventListener('click', (e) => {
        socket.emit('accept-request', {from:requester, to:requested});
      });
    }
    else if (e.details === "friends") { // are already friends with this account
      addfriendbutton.disabled = true;
      addfriendbutton.innerHTML = 'Accepted';
    }
    else if (e.details === "sent") { // already sent a request to this account
      addfriendbutton.disabled = true;
      addfriendbutton.innerHTML = 'Pending';
    }
  });
}

function handleSearch(searchbar) {
  const content = searchbar.value;
  socket.emit('search',{content: content});
}

// toggling an element
function showHide(id) {
    const x = document.getElementById(id);
    if (x.style.display === "block") {
      x.style.display = "none";
    } else {
      x.style.display = "block";
    }
}

function createProfileCard(data) {
  const profilecard = document.createElement('div');
  profilecard.className ="profilecard";
  profilecard.id = data.msid;
  profilecard.innerHTML = `
    <img class="profilepic" src="/img/${data.img_url}" alt="card image">
    <div class="profilename">
      ${data.username}
      <div class="small-text">${data.bio}</div>
      </div>
    </div>`;
  
    return profilecard;
}

function createFriendsCard(data) {
  const friendscard = document.createElement('div');
  friendscard.className = "profilecard";
  friendscard.innerHTML = `
    <div class="card-body">
    <h6 class="card-title">Friends</h6>
    <p class="card-text">(quick view of friends here)</p>
    </div>`;
  return friendscard;
}