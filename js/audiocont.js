$(function(){
  $("#highpass").knob({
    'change' : function() {
      var highpassVal = $('#highpass').val();
      highPassFilter.gain.value = highpassVal;
    }
  });
  $("#mid").knob({
    'change' : function() {
      var midVal = $('#mid').val();
      midFilter.gain.value = midVal;
    }
  });
  $("#lowpass").knob({
    'change' : function() {
      var lowpassVal = $('#lowpass').val();
      lowPassFilter.gain.value = lowpassVal;
    }
  });
  $("#gain").knob({
    'change' : function() {
      var gainVal = $('#gain').val();
      gainNode.gain.value = gainVal / 10;
    }
  });
  $("#pan").knob({
    'change' : function() {
      var xDeg = parseInt($('#pan').val());
      var zDeg = xDeg + 90;
      if (zDeg > 90) {
        zDeg = 180 - zDeg;
      }
      var x = Math.sin(xDeg * (Math.PI / 180));
      var z = Math.sin(zDeg * (Math.PI / 180));
      pan.setPosition(x, 0, z);
    }
  });
  $('.hideshow').hide();
}); 

var highPassFilter, reverb, soundSource, 
    soundBuffer, audioData, tempBuffer, 
    source, button, hue, 
    refreshInter = 0, impulseResponseBuffer = [];

// Array of implulse responses
var SOUNDS = ['spring','muffler','echo','telephone'],
    SOUND_PATH = 'sounds';

if (typeof AudioContext !== 'undefined') {
  context = new AudioContext();
} else if (typeof webkitAudioContext !== 'undefined') {
  context = new webkitAudioContext();
} else {
  alert('No Web Audio supported...');
}

var analyser = context.createAnalyser(),
    highPassFilter = context.createBiquadFilter(),
    midFilter = context.createBiquadFilter(),
    lowPassFilter = context.createBiquadFilter(),
    gainNode = context.createGain(),
    convolver = context.createConvolver(),
    compressor = context.createDynamicsCompressor(),
    pan = context.createPanner();

//Initial values for HighPass filter
highPassFilter.type = "highshelf";
highPassFilter.frequency.value = 12000;
highPassFilter.gain.value = 0;

//Initial values for Peaking filter
midFilter.type = "peaking";
midFilter.frequency.value = 2500;
midFilter.Q.value = 1;
midFilter.gain.value = 0;

//Initial values for LowPass filter
lowPassFilter.type = "lowshelf";
lowPassFilter.frequency.value = 80;
lowPassFilter.gain.value = 0;

//Initial values for Gain
gainNode.gain.value = 1;

var canvas = document.getElementById('fft');
var ctx = canvas.getContext('2d');
canvas.width = document.body.clientWidth / 2;

const CANVAS_HEIGHT = canvas.height,
      CANVAS_WIDTH = canvas.width;

var buttons = document.querySelectorAll('button');
    buttons[0].disabled = true;
    buttons[1].disabled = true;

function init(uploadedBuffer) {
  if (!window.webkitAudioContext) {
    alert("Web Audio isn't available in your browser :)");
    return;
  }
  context.decodeAudioData(uploadedBuffer, function(buffer) {
    audioData = buffer;
    buttons[0].disabled = false;
    buttons[1].disabled = false;
  });
}

var fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', function(e) {  
  var reader = new FileReader();
  reader.onload = function(e) {
    init(e.target.result);
  };
  reader.readAsArrayBuffer(this.files[0]);
}, false);

// Event Listeners
document.querySelector('.play').addEventListener('click', play);
document.querySelector('.stop').addEventListener('click', stop);
var radiobuttons = document.querySelectorAll('input[type="radio"][value="0"]');


function show(){
  var element = document.querySelector('.hideshow');
  element.style.display = 'block';
}

function hide(){
  var element = document.querySelector('.hideshow');
  element.style.display = 'none';
}

function rafCallback() {
  window.webkitRequestAnimationFrame(rafCallback, canvas);
  var freqByteData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freqByteData); 
  var SPACER_WIDTH = 5,
      BAR_WIDTH = 3,
      OFFSET = 100,
      CUTOFF = 23;

  var numBars = Math.round(CANVAS_WIDTH / SPACER_WIDTH);
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.lineCap = 'round';

  // Draw rectangle for each frequency bin.
  for (var i = 0; i < numBars; ++i) {
    var magnitude = freqByteData[i + OFFSET];
    hue = parseInt(120 * (1 - (magnitude / 255)), 10);
    ctx.fillStyle = 'hsl(' + hue + ',75%,50%)';
    ctx.fillRect(i * SPACER_WIDTH, CANVAS_HEIGHT, BAR_WIDTH, -magnitude);
  }
}

function fetchImpulseResponses(index) {
  var request = new XMLHttpRequest();
    request._name = SOUNDS[index];
    request.open('GET', SOUND_PATH + '/' + request._name + '.wav', true);
    request.responseType = 'arraybuffer';
    request.onload = function() {
      context.decodeAudioData(request.response, function(buffer){
        impulseResponseBuffer[index] = buffer;
        convolver.buffer = impulseResponseBuffer[index];
      });
    }
    request.send();
  }

function play() {
  var start = 0;
  source = context.createBufferSource(); 
  source.buffer = audioData; 
  source.loop = true; 
  source.connect(gainNode);
  source.start(0); 
  rafCallback();
}

function stop(){
  if(source) {
    source.stop(/*source.currentTime*/);
    source.disconnect(0);
  }
}

// EQ on/off
// Connection Schema: gain -> highpass -> mid -> lowpass -> pan -> analyser
var eqCheck = document.querySelector('.eqcheck');
eqCheck.addEventListener('change', function(){
  if (eqCheck.checked) {
    if (reverbCheck.checked) {
      reverbOn.checked = false;
      reverbCheck.checked = false;
    }
    gainNode.disconnect(0);
    pan.disconnect(0);
    gainNode.connect(highPassFilter);
    highPassFilter.connect(midFilter);
    midFilter.connect(lowPassFilter);
    lowPassFilter.connect(pan);
    pan.connect(analyser);
    analyser.connect(context.destination);
  } else {
    gainNode.disconnect(0);
    pan.disconnect(0);
    highPassFilter.disconnect(0);
    midFilter.disconnect(0);
    lowPassFilter.disconnect(0);
    gainNode.connect(pan);
    pan.connect(analyser);
    analyser.connect(context.destination);
  }
});

// Reverb on/off
// Connection Schema: gain -> highpass -> mid -> lowpass -> pan -> analyser
var reverbOn = document.querySelector('.reverbOn');
var reverbCheck = document.querySelector('.reverb');

reverbOn.addEventListener('change', function(){
  if (reverbOn.checked) {
    radiobuttons[0].addEventListener('click', show);
    $('.reverb').click(function(){
      fetchImpulseResponses($(this).val());
    });
  } else {
    hide();
    gainNode.disconnect(0);
    pan.disconnect(0);
    convolver.disconnect(0);
    gainNode.connect(pan);
    pan.connect(analyser);
    analyser.connect(context.destination);
  }
});

reverbCheck.addEventListener('change', function(){
  if (reverbCheck.checked) {
    if (eqCheck.checked) {
      eqCheck.checked = false;
    }
    gainNode.disconnect(0);
    pan.disconnect(0);
    analyser.disconnect(0);
    gainNode.connect(pan);
    pan.connect(convolver);
    convolver.connect(analyser);
    analyser.connect(context.destination);
  } else {
    gainNode.disconnect(0);
    pan.disconnect(0);
    convolver.disconnect(0);
    gainNode.connect(pan);
    pan.connect(analyser);
    analyser.connect(context.destination);
  }
});

var compressorCheck = document.querySelector('.compressor');
compressorCheck.addEventListener('change', function(){
  if (compressorCheck.checked) {
    gainNode.disconnect(0);
    analyser.disconnect(0);
    gainNode.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(context.destination);
  } else {
    gainNode.disconnect(0);
    compressor.disconnect(0);
    gainNode.connect(pan);
    pan.connect(analyser);
    analyser.connect(context.destination);
  }
});

// Default Wiring
  gainNode.connect(pan);
  pan.connect(analyser);
  analyser.connect(context.destination);
