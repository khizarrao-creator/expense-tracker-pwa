const apiKey = "AIzaSyBY00BWspgFXZz3BKqMXqXpcFW8z8ITEvg";

async function run() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  const gemmaList = data.models.filter(m => m.name.toLowerCase().includes("gemma"));
  console.log(JSON.stringify(gemmaList, null, 2));
}

run();
