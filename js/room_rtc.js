const APP_ID = "af633987e6be495aafe799b3d6daca51";

let token = null;
let client;

let rtmClient;
let channel;

let uid = sessionStorage.getItem("uid");
if (!uid) {
  uid = String(Math.floor(Math.random() * 10000));
  sessionStorage.setItem("uid", uid);
}
const isHost = sessionStorage.getItem("is_host") == "true";
if (isHost) {
  console.log(`I am the host ${isHost}`);
}

let userName = sessionStorage.getItem("display_name");
if (!userName) {
  window.location = "index.html";
}

let groups = {};
let users = {
  [uid]: {
    id: uid,
    name: userName,
  },
};

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("room");

if (!roomId) {
  roomId = "main";
}

let localTracks = [];
let remoteUsers = {};

let joinRoomInit = async () => {
  rtmClient = await AgoraRTM.createInstance(APP_ID);
  await rtmClient.login({ uid, token });

  await rtmClient.addOrUpdateLocalUserAttributes({ name: userName });

  channel = await rtmClient.createChannel(roomId);
  await channel.join();

  client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

  channel.on("ChannelMessage", handleChannelMessage);

  await client.join(APP_ID, roomId, token, uid);

  client.on("user-published", handleUserPublished);
  client.on("user-left", handleUserLeft);
};

let joinStream = async () => {
  sessionStorage.setItem("has_joined", true);
  console.log("User has joined, setting has_joined to true");
  document.getElementById("join-btn").style.display = "none";
  document.getElementsByClassName("stream__actions")[0].style.display = "flex";

  localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();

  let player = `<div class="video__container" id="user-container-${uid}">
                    <div class="video-player" id="user-${uid}"></div>
                </div>`;

  document
    .getElementById("streams__container")
    .insertAdjacentHTML("beforeend", player);

  localTracks[1].play(`user-${uid}`);
  await client.publish([localTracks[0], localTracks[1]]);
  const videoContainer = document.getElementById(`user-container-${uid}`);
  videoContainer.classList.add("me");
  const nameLabel = document.createElement("div");
  nameLabel.classList.add("name-label");
  nameLabel.textContent = users[uid].name;
  videoContainer.appendChild(nameLabel);
  console.log(videoContainer);
  channel.sendMessage({
    text: JSON.stringify({ type: "user_joined", uid: uid, name: userName }),
  });
  console.log("User has joined, sending user_joined message");
};

let handleUserPublished = async (user, mediaType) => {
  remoteUsers[user.uid] = user;
  let { name } = await rtmClient.getUserAttributesByKeys(user.uid, ["name"]);
  console.log(name);
  await client.subscribe(user, mediaType);

  let player = document.getElementById(`user-container-${user.uid}`);
  if (player === null) {
    player = `<div class="video__container" id="user-container-${user.uid}">
                <div class="video-player" id="user-${user.uid}"></div>
            </div>`;

    document
      .getElementById("streams__container")
      .insertAdjacentHTML("beforeend", player);
  }

  if (mediaType === "video") {
    user.videoTrack.play(`user-${user.uid}`);
    const videoContainer = document.getElementById(
      `user-container-${user.uid}`
    );
    const nameLabel = document.createElement("div");
    nameLabel.classList.add("name-label");
    nameLabel.textContent = name;
    videoContainer.appendChild(nameLabel);
  }

  if (mediaType === "audio") {
    user.audioTrack.play();
  }
  updateVolumeAndBorderColor();
};

let handleUserLeft = async (user) => {
  delete remoteUsers[user.uid];
  let item = document.getElementById(`user-container-${user.uid}`);
  if (item) {
    item.remove();
  }

  for (let group in groups) {
    let index = groups[group].indexOf(user.uid);
    if (index !== -1) {
      groups[group].splice(index, 1);
      for (let remainingUserID of groups[group]) {
        groups[remainingUserID] = [...groups[group]];
      }
    }
  }

  delete groups[user.uid];

  delete users[user.uid];
};

let toggleMic = async (e) => {
  let button = e.currentTarget;

  if (localTracks[0].muted) {
    await localTracks[0].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[0].setMuted(true);
    button.classList.remove("active");
  }
};

let toggleCamera = async (e) => {
  let button = e.currentTarget;

  if (localTracks[1].muted) {
    await localTracks[1].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[1].setMuted(true);
    button.classList.remove("active");
  }
};

let leaveStream = async (e) => {
  if (e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }

  document.getElementById("join-btn").style.display = "block";
  document.getElementsByClassName("stream__actions")[0].style.display = "none";

  for (let i = 0; localTracks.length > i; i++) {
    localTracks[i].stop();
    localTracks[i].close();
  }

  await client.unpublish([localTracks[0], localTracks[1]]);

  document.getElementById(`user-container-${uid}`).remove();

  channel.sendMessage({
    text: JSON.stringify({ type: "user_left", uid: uid }),
  });
  if (isHost) {
    channel.sendMessage({ text: JSON.stringify({ type: "end_meeting" }) });
  }
};

function updateVolumeAndBorderColor() {
  for (let userId in users) {
    let videoContainer = document.getElementById(`user-container-${userId}`);
    if (videoContainer) {
      if (groups[userId] && groups[userId].includes(uid)) {
        setBorderColor("green", userId);
        changeVolume(100, userId);
      } else {
        setBorderColor("red", userId);
        changeVolume(20, userId);
      }
    }
  }
}

let handleChannelMessage = async (messageData) => {
  let data = JSON.parse(messageData.text);
  console.log(`New message: ${data.type}`);
  console.log(data);

  if (data.type === "user_left") {
    document.getElementById(`user-container-${data.uid}`).remove();
    delete groups[data.uid];
  }

  if (data.type === "user_joined") {
    users[data.uid] = {
      id: data.uid,
      name: data.name,
    };
    console.log(users);

    await channel.sendMessage({
      text: JSON.stringify({
        type: "user_list",
        users: users,
        groups: groups,
        to: data.uid,
      }),
    });
    updateVolumeAndBorderColor();
  }

  if (data.type === "user_list" && data.to === uid) {
    users = data.users;
    groups = data.groups;
    console.log(users);
    console.log(groups);
    updateVolumeAndBorderColor();
  }

  if (data.type === "end_meeting") {
    confirm("The host has ended the meeting. Redirecting to Lobby...");
    leaveStream();
    leaveChannel();
    window.location = "index.html";
  }

  if (data.type === "focus" && data.to === uid) {
    console.log(`User ${data.to} is focusing on ${data.from}.`);
    if (data.to === uid) {
      let promptingName = users[data.from].name;
      alert(`${promptingName} is focusing on you.`);

      for (let userId in groups) {
        let index = groups[userId].indexOf(data.from);
        if (index !== -1) {
          groups[userId].splice(index, 1);
          console.log(`From focus handler: removed ${userId} from a group: ${groups[userId]}`)
        }
      }

      for(let userId in groups){
        for(let remainingUserId of groups[userId]){
          groups[remainingUserId] = [...groups[userId]];
        }
      }

      delete groups[data.from];
      console.log(`From focus handler:`)
      console.log(groups)

      let focusedUserGroup = groups[data.to];

      if (!focusedUserGroup) {
        groups[data.to] = [data.to, data.from];
        groups[data.from] = [data.to, data.from];
      } else {
        // let focusingUserGroup = groups[data.from];
        // if(focusingUserGroup) {
        //   let index = focusingUserGroup.indexOf(data.from);
        //   if (index !== -1) {
        //     focusingUserGroup.splice(index, 1);
        //   }
        // }

        focusedUserGroup.push(data.from);

        for (let userId of focusedUserGroup) {
          groups[userId] = [...focusedUserGroup];
        }
      }
      console.log(`After addition: ${groups}`)

      console.log(groups[data.to]);
      console.log(groups[data.from]);

      for (let userId in users) {
        await channel.sendMessage({
          text: JSON.stringify({
            type: "group_update",
            group: groups[data.to],
          }),
        });
      }
      console.log(groups);
      updateVolumeAndBorderColor();
    }
  }

  if (data.type === "group_update") {
    // Update the group information for the users in the group
    for (let userId of data.group) {
      groups[userId] = data.group;
    }
    console.log(groups);
    updateVolumeAndBorderColor();
  }

  // if (data.type === "ignore" && data.to === uid) {
  //   // Notify the user that they were ignored
  //   if (data.to === uid) {
  //     let promptedName = users[data.from].name;
  //     alert(`${promptedName} ignored your focus.`);
  //   }
  // }
};

let leaveChannel = async () => {
  await channel.leave();
  await rtmClient.logout();
};

// async function promptUser(userId, message) {
//   // Check if the current user is the one being prompted
//   if (userId === uid) {
//     return Promise.resolve(confirm(message));
//   } else {
//     // If the current user is not the one being prompted, return false
//     return Promise.resolve(false);
//   }
// }

function changeVolume(volumeLevel, userID) {
  if (userID === uid) {
    if (localTracks[0]) {
      localTracks[0].setVolume(volumeLevel);
    }
  } else {
    let userObject = remoteUsers[userID];
    if (userObject && userObject.audioTrack) {
      userObject.audioTrack.setVolume(volumeLevel);
    }
  }
}

function setBorderColor(color, userID) {
  let videoContainer = document.getElementById(`user-container-${userID}`);
  if (videoContainer) {
    if (color === "green") {
      videoContainer.classList.add("focused-user");
      videoContainer.classList.remove("unfocused-user");
    } else {
      videoContainer.classList.add("unfocused-user");
      videoContainer.classList.remove("focused-user");
    }
  }
}

(async () => {
  await joinRoomInit();
})();

document.getElementById("join-btn").addEventListener("click", joinStream);
document.getElementById("camera-btn").addEventListener("click", toggleCamera);
document.getElementById("mic-btn").addEventListener("click", toggleMic);
document.getElementById("leave-btn").addEventListener("click", leaveStream);
window.addEventListener("beforeunload", leaveChannel);
