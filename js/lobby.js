let form = document.getElementById("lobby__form");
let isHostCheckbox = document.getElementById("is_host_true");

let displayName = sessionStorage.getItem("display_name");
if (displayName) {
  form.name.value = displayName;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  sessionStorage.setItem("display_name", e.target.name.value);
  if (isHostCheckbox.checked) {
    sessionStorage.setItem("is_host", "true");
  } else {
    sessionStorage.setItem("is_host", "false");
  }

  sessionStorage.setItem("has_joined", false);

  let inviteCode = e.target.room.value;
  if (!inviteCode) {
    inviteCode = String(Math.floor(Math.random() * 10000));
  }
  window.location = `room.html?room=${inviteCode}&host=${isHostCheckbox.checked}`;
});
