let userId = sessionStorage.getItem("uid");
let hasJoined = sessionStorage.getItem("has_joined");
const THRESHOLD_TIME = 1000;
const RESET_DELAY = 500;
const COOLDOWN = 10000;
let gazeStartTime = null;
let resetGazeTimeout = null;
let lastSwitchTime = null;
let currentFocusedGroup = null;

function isLookingAtElement(gazeData, element) {
  if (element.id === `user-container-${userId}`) return false;
  if (
    typeof element === "object" &&
    element !== null &&
    "getBoundingClientRect" in element
  ) {
    const elementRect = element.getBoundingClientRect();
    const gazeX = gazeData.x;
    const gazeY = gazeData.y;

    return (looking =
      gazeX >= elementRect.left - 100 &&
      gazeX <= elementRect.right + 100 &&
      gazeY >= elementRect.top - 100 &&
      gazeY <= elementRect.bottom + 100);
  }
  return false;
}

async function focusOnUser(uid) {
  console.log("Focusing on user: ", uid);

  for(let userId in groups){
    let index = groups[userId].indexOf(userId);
    if(index !== -1){
      groups[userId].splice(index, 1);
    }
  }

  // Update the groups for all remaining users in each group
  for(let userId in groups){
    for(let remainingUserId of groups[userId]){
      groups[remainingUserId] = [...groups[userId]];
    }
  }

  // Remove the focusing user's own group
  delete groups[userId];

  let focusedUserGroup = groups[uid];

  if (!focusedUserGroup) {
    groups[uid] = [uid, userId];
    groups[userId] = [uid, userId];
  } else {
    focusedUserGroup.push(userId);

    for (let userId of focusedUserGroup) {
      groups[userId] = [...focusedUserGroup];
    }
  }

  await channel.sendMessage({
    text: JSON.stringify({
      type: "focus",
      from: userId,
      to: uid,
    }),
  });
}

function startEyeTracking() {
  webgazer
    .setGazeListener(function (gazeData) {
      if (gazeData == null) {
        gazeStartTime = null;
        return;
      }
      let currentTime = new Date().getTime();
      if (lastSwitchTime && currentTime - lastSwitchTime < COOLDOWN) return;

      let videoContainers = document.getElementsByClassName("video__container");
      for (container of videoContainers) {
        if (isLookingAtElement(gazeData, container)) {
          if (gazeStartTime === null) {
            gazeStartTime = new Date().getTime();
          } else {
            const gazeDuration = new Date().getTime() - gazeStartTime;
            if (gazeDuration >= THRESHOLD_TIME) {
              let focusId = container.id.split("-")[2];
              console.log(`User ${userId} is looking at ${container.id}`);
              if (
                !container.classList.contains("focused-user") &&
                userId !== focusId
              ) {
                console.log(users);
                let focusName = users[focusId].name;
                let userWantsToFocus = confirm(
                  `Do you want to switch focus to ${focusName}?`
                );
                if (userWantsToFocus) {
                  focusOnUser(focusId);
                }
                gazeStartTime = null;
                lastSwitchTime = currentTime;
              }
            }
          }

          if (resetGazeTimeout) {
            clearTimeout(resetGazeTimeout);
            resetGazeTimeout = null;
          }
        } else {
          if (!resetGazeTimeout) {
            resetGazeTimeout = setTimeout(() => {
              gazeStartTime = null;
              resetGazeTimeout = null;
            }, RESET_DELAY);
          }
        }
      }
    })
    .begin();

  webgazer.showVideoPreview(false).showPredictionPoints(true);
}

let checkJoinedInterval = setInterval(() => {
  hasJoined = sessionStorage.getItem("has_joined");
  userId = sessionStorage.getItem("uid");
  if (userId && hasJoined && hasJoined === "true") {
    clearInterval(checkJoinedInterval);
    console.log("User has joined");
    startEyeTracking();
  }
}, 1000);
