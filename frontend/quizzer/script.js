// DOM Utilities

import { elid, elall, newEl } from "../modules/domFuncs.js";
import {changeMode, setInitialStyle} from "../modules/darkmode.js";
import LimitedPlayer from '../modules/LimitedPlayer.js';
import Timer from '../modules/Timer.js';

setInitialStyle();

const root = elid("root");
const totalTime = elid("totalTime");
const beginBtn = elid("beginQuiz");
const nameInput = elid("nameInput");
const introDialog = elid("introDialog");
const filter = elid("filter");
const numQuestions = elid("numQuestions");
const viewResponses = elid("viewResponses");
const lightDark = elid("lightDark");
const userDisplay = elid("currentUser");
const qList = [];
const players = [];
let quizTimer = null;
let thisQuizId = null;
let user = null;

// Store current time remaining, checked responses, and listen limits in localStorage

function updateStorage() {
    const stateUpdate = {
        user: user,
        timeRemaining: quizTimer.remaining,
        listenLimits: players.map(p=>p.remaining),
        selected: qList.map(form=>{
            if (form.querySelector("input:checked")) {
                return form.querySelector("input:checked").value
            } else {
                return null
            }
        })
    }
    localStorage.setItem("quizState"+thisQuizId, JSON.stringify(stateUpdate))
}

// If quizState exists in localStorage for this quiz id, restore checkmarks, listen limits, and time remaining

function restoreState(state) {
    // Restore user
    user = state.user
    userDisplay.textContent = state.user;
    // Restore timer settings
    quizTimer.remaining = state.timeRemaining;
    quizTimer.countdown();
    quizTimer.startTimer();
    // Restore listen limits & responses
    for (let i = 0; i<players.length; i++) {
        players[i].remaining = state.listenLimits[i]
        players[i].remDisplay.textContent = players[i].remaining + " remaining plays";
        if (state.listenLimits[i] <= 0) {
          players[i].button.setAttribute("disabled", true);
        }
        if (state.selected[i]) {
            qList[i].querySelector(`label:nth-of-type(${parseInt(state.selected[i])+1})`).querySelector("input").checked = true;
        }
    }
}

// Retrieve all indexes of checked radio buttons and submit with username and timestamp to API

function submitAll() {
  const checks = elall("input[type='radio']:checked");
  const data = {
    user,
    timestamp: new Date().toTimeString(),
    responses: Array.from(checks).map((check) => check.value),
  };
  quizTimer && clearInterval(quizTimer?.interval);
  fetch(`http://localhost:8000/quiz/${thisQuizId}/response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
    .then((res) => {
      window.localStorage.removeItem("quizState" + thisQuizId);
      userDisplay.parentNode.innerHTML = ""
      root.innerHTML = `<h2 class='status'>Submitted Successfully</h2>`;
      user = null;
      quizTimer = null;
    })
    .catch((err) => {
      alert("Error reaching server:" + err);
    });
}

// Create instance of LimitedPlayer class and store it in players array

function createPlayer(file, limit) {
  const player = new LimitedPlayer(file, limit);
  players.push(player)
  player.audio.addEventListener("play", updateStorage)
  return player;
}

// Create player and quiz form for each question object passed in and return LimitedPlayer instance and quiz form element

function createQuestion(q) {
  const form = newEl("form", null, "questionForm");
  const player = createPlayer(q.file, q.limit);
  
  form.innerHTML += `<h2 class="qTitle">${q.title}</h2>`;
  for (const [value, opt] of q.options.entries()) {
    form.innerHTML += `<label>${opt}<input required type="radio" value="${value}" name="${
      q.title + "option"
    }"></label>`;
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
  });
  
  qList.push(form);
  return [player, form]
}

// Iterate through questions and append their required elements to the provided box element

function populateQuestions(box, qList) {
  console.log(qList);
  for (const q of qList) {
    const [player, form] = createQuestion(q);
    root.append(player.audio);
    box.appendChild(player.player);
    box.appendChild(form)
  }
}

// Create timer and quiz container elements and add to DOM.

function createQuiz(quiz) {
  const container = newEl("article", "quizBox", "softCorner");
  if (quiz.timeLimit != "null") {
    quizTimer = new Timer(quiz.timeLimit, thisQuizId, submitAll);
    root.appendChild(quizTimer.display);
  }
  root.appendChild(container);
  populateQuestions(container, quiz.questions);
  const subBtn = newEl("button", "submitAll", "softCorner");
  subBtn.textContent = "Submit Quiz";
  subBtn.addEventListener("click", submitAll);
  container.appendChild(subBtn);
  const oldState = window.localStorage.getItem("quizState"+thisQuizId);
  if (oldState) {
      restoreState(JSON.parse(oldState));
  } else {
    gatherInfo(quiz.timeLimit, quiz.questions.length);
  }
}

function apiCall(quizId) {
  fetch("http://localhost:8000/quiz/" + quizId)
    .then((data) => {
      return data.json();
    })
    .then((quizObject) => {
      console.log("object: \n" + quizObject);
      thisQuizId = quizId;
      createQuiz(quizObject, quizId);
      viewResponses.addEventListener("click", ()=>{
        window.location.href = "http://127.0.0.1:3000/audioQuizlet/frontend/viewer/index.html?id="+quizId
      });
    })
    .catch((err) => {
      console.log(err);
      root.innerHTML = "<h2 class='status'>Error reaching server</h2>";
    });
}

function gatherInfo(time, questions) {
  if (time == "null") {
    totalTime.textContent = "unlimited time";
  } else {
    totalTime.textContent = time == 1 ? "1 minute" : time + " minutes";
  }
  numQuestions.textContent =
    questions == 1 ? "1 question" : questions + " questions";
  introDialog.showModal();
  filter.style.display = "block";
  nameInput.addEventListener("input", () => {
    if (nameInput.value.length < 3) {
      beginBtn.setAttribute("disabled", true);
    } else {
      beginBtn.removeAttribute("disabled");
    }
  });
  nameInput.addEventListener("keyup", (e) => {
    if (e.key == "Enter") {
      beginQuiz();
    }
  });
  beginBtn.addEventListener("click", beginQuiz);
}

function beginQuiz() {
  let name = nameInput.value;
  if (name.length < 3) {
    alert("Name must be at least 3 characters long");
    return;
  }
  user = name;
  userDisplay.textContent = user;
  introDialog.close();
  elid("filter").style.display = "none";
  quizTimer && quizTimer.startTimer();
}

window.addEventListener("load", () => {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  if (urlParams.has("id")) {
    console.log("retrieving quiz " + urlParams.get("id"));
    apiCall(urlParams.get("id"));
  } else {
    root.innerHTML = "<h2 class='status'>Invalid Quiz ID</h2>";
  }
});

window.addEventListener("beforeunload", ()=>{
  if (user) {
    updateStorage();
  }
});
lightDark.addEventListener("click", changeMode);
 