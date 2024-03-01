'use strict';

function processSubtitles(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var content = e.target.result;
      var fileName = file.name;
      var subtitleType = fileName.substr(fileName.lastIndexOf('.'));
      switch (subtitleType) {
        case '.vtt':
          console.log('Unsupported subtitle format');
          processVTT(content);
          break;
        case '.srt':
          console.log('srt')
          processSRT(content);
          break;
        case '.json':
          processJSON(content);
          break;
        default:
          console.log('Maybe Unsupported subtitle format');
          break;
      }
    };
    reader.readAsText(file);
  }

  function processVTT(content) {
    // process VTT subtitle file
  }

  function processSRT(content) {
    // code taken from https://github.com/hyperaudio/ha-converter/blob/master/src/converter.js
    var i = 0,
      len = 0,
      idx = 0,
      lines,
      time,
      text,
      sub;

    // Simple function to convert HH:MM:SS,MMM or HH:MM:SS.MMM to SS.MMM
    // Assume valid, returns 0 on error

    var toSeconds = function (t_in) {
      var t = t_in.split(':');

      try {
        var s = t[2].split(',');

        // Just in case a . is decimal seperator
        if (s.length === 1) {
          s = t[2].split('.');
        }

        return (
          parseFloat(t[0], 10) * 3600 +
          parseFloat(t[1], 10) * 60 +
          parseFloat(s[0], 10) +
          parseFloat(s[1], 10) / 1000
        );
      } catch (e) {
        return 0;
      }
    };

    var outputString = '<p>';
    var lineBreaks = true;
    var ltime = 0;
    var ltext;

    // Here is where the magic happens
    // Split on line breaks
    lines = content.split(/(?:\r\n|\r|\n)/gm);
    len = lines.length;

    for (i = 0; i < len; i++) {
      sub = {};
      text = [];

      sub.id = parseInt(lines[i++], 10);

      // Split on '-->' delimiter, trimming spaces as well

      try {
        time = lines[i++].split(/[\t ]*-->[\t ]*/);
      } catch (e) {
        alert('Warning. Possible issue on line ' + i + ": '" + lines[i] + "'.");
        break;
      }

      sub.start = toSeconds(time[0]);

      // So as to trim positioning information from end
      if (!time[1]) {
        alert('Warning. Issue on line ' + i + ": '" + lines[i] + "'.");
        return;
      }

      idx = time[1].indexOf(' ');
      if (idx !== -1) {
        time[1] = time[1].substr(0, idx);
      }
      sub.end = toSeconds(time[1]);

      // Build single line of text from multi-line subtitle in file
      while (i < len && lines[i]) {
        text.push(lines[i++]);
      }

      // Join into 1 line, SSA-style linebreaks
      // Strip out other SSA-style tags
      sub.text = text.join('\\N').replace(/\{(\\[\w]+\(?([\w\d]+,?)+\)?)+\}/gi, '');

      // Escape HTML entities
      sub.text = sub.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Unescape great than and less than when it makes a valid html tag of a supported style (font, b, u, s, i)
      // Modified version of regex from Phil Haack's blog: http://haacked.com/archive/2004/10/25/usingregularexpressionstomatchhtml.aspx
      // Later modified by kev: http://kevin.deldycke.com/2007/03/ultimate-regular-expression-for-html-tag-parsing-with-php/
      sub.text = sub.text.replace(
        /&lt;(\/?(font|b|u|i|s))((\s+(\w|\w[\w\-]*\w)(\s*=\s*(?:\".*?\"|'.*?'|[^'\">\s]+))?)+\s*|\s*)(\/?)&gt;/gi,
        '<$1$3$7>'
      );
      //sub.text = sub.text.replace( /\\N/gi, "<br />" );
      sub.text = sub.text.replace(/\\N/gi, ' ');

      var splitMode = 0;

      var wordLengthSplit = $('#word-length').prop('checked');

      // enhancements to take account of word length

      var swords = sub.text.split(' ');
      var sduration = sub.end - sub.start;
      var stimeStep = sduration / swords.length;

      // determine length of words

      var swordLengths = [];
      var swordTimes = [];

      var totalLetters = 0;
      for (var si = 0, sl = swords.length; si < sl; ++si) {
        totalLetters = totalLetters + swords[si].length;
        swordLengths[si] = swords[si].length;
      }

      var letterTime = sduration / totalLetters;
      var wordStart = 0;

      for (var si = 0, sl = swords.length; si < sl; ++si) {
        var wordTime = swordLengths[si] * letterTime;
        var stime;
        if (wordLengthSplit) {
          stime = Math.round((sub.start + si * stimeStep) * 1000);
          var event = new CustomEvent('ga', {
            detail: { origin: 'HA-Converter', type: 'Setting', action: 'Word length split ON' }
          });
          document.dispatchEvent(event);
        } else {
          stime = Math.round((wordStart + sub.start) * 1000);
          var event = new CustomEvent('ga', {
            detail: { origin: 'HA-Converter', type: 'Setting', action: 'Word length split OFF' }
          });
          document.dispatchEvent(event);
        }

        wordStart = wordStart + wordTime;
        var stext = swords[si];

        if (stime - ltime > paraSplitTime * 1000 && paraSplitTime > 0) {
          //console.log("fullstop? "+stext+" - "+stext.indexOf("."));
          var punctPresent =
            ltext && (ltext.indexOf('.') > 0 || ltext.indexOf('?') > 0 || ltext.indexOf('!') > 0);
          if (!paraPunct || (paraPunct && punctPresent)) {
            outputString += '</p><p>';
          }
        }

        outputString += '<span data-m="' + stime + '">' + stext + ' </span>';

        ltime = stime;
        ltext = stext;

        if (lineBreaks) outputString = outputString + '\n';
      }
    }
    outputString += '</p>';
    console.log(outputString);
    insertSubtitles(outputString);
    new HyperaudioLite("hypertranscript", "hyperplayer", minimizedMode, autoScroll, doubleClick, webMonetization, playOnClick);
  }

  function processJSON(content) {
    // Parse the JSON content
    const data = JSON.parse(content);
    // Initialize the output string with the opening tags
    let outputString = '<p>start';
    // Initialize the end time of the last word
    let lastEndTime = 0;
    // Iterate over the segments
    for (const segment of data.segments) {
      // Iterate over the words in each segment
      for (const word of segment.words) {
        // If the start time of the current word is more than 2 seconds after the end time of the last word, add a new paragraph
        if (word.start - lastEndTime > 2) {
          outputString += '</p><p>';
        } else if (word.start - lastEndTime > 0.4) {
          outputString += `<span data-m="${Math.round(word.start * 1000)}" data-d="400">，</span>`;
        }
        // Add a span element for the current word
        outputString += `<span data-m="${Math.round(word.start * 1000)}" data-d="${Math.round((word.end - word.start) * 1000)}">${/^[a-zA-Z]+$/.test(word.word) ? word.word + ' ' : word.word}</span>`;
        // Update the end time of the last word
        lastEndTime = word.end;
      }
    }
    // Add the closing tags
    outputString += '</p>';
    console.log(outputString);
    insertSubtitles(outputString);
    new HyperaudioLite("hypertranscript", "hyperplayer", minimizedMode, autoScroll, doubleClick, webMonetization, playOnClick);
  }
