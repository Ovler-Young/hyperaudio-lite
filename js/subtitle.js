'use strict';

function processSubtitles(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var content = e.target.result;
      var fileName = file.name;
      var subtitleType = fileName.substr(fileName.lastIndexOf('.'));
      switch (subtitleType) {
        case '.vtt':
          processVTT(content);
          break;
        case '.srt':
          console.log('srt')
          processSRT(content);
          break;
        case '.json':
          processJSON(content);
          break;
        case '.ass':
          processASS(content);
          break;
        default:
          console.log('Maybe Unsupported subtitle format');
          break;
      }
    };
    reader.readAsText(file);
  }

  function processVTT(content) {
    if (typeof lastSubtitleContent !== 'undefined') {
      lastSubtitleContent = content;
      lastSubtitleType = '.vtt';
    }

    var toSeconds = function(t_in) {
      if (!t_in) return 0;

      var timestamp = t_in.trim().split(/\s+/)[0].replace(',', '.');
      var parts = timestamp.split(':');
      var hours = 0;
      var minutes = 0;
      var secondsPart;

      if (parts.length === 3) {
        hours = parseFloat(parts[0], 10);
        minutes = parseFloat(parts[1], 10);
        secondsPart = parts[2];
      } else if (parts.length === 2) {
        minutes = parseFloat(parts[0], 10);
        secondsPart = parts[1];
      } else {
        return 0;
      }

      var seconds = parseFloat(secondsPart, 10);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return 0;

      return hours * 3600 + minutes * 60 + seconds;
    };

    var escapeHtml = function(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    var extractSpeaker = function(text) {
      var match = text.match(/<v(?:\.[^>\s]+)?(?:\s+([^>]*?))?>/i);
      return match && match[1] ? match[1].trim() : '';
    };

    var cleanText = function(text) {
      return text
        .replace(/<v(?:\.[^>\s]+)?(?:\s+[^>]*)?>/gi, '')
        .replace(/<\/v>/gi, '')
        .replace(/<c(?:\.[^>\s]+)*>/gi, '')
        .replace(/<\/c>/gi, '')
        .replace(/<lang\s+[^>]+>/gi, '')
        .replace(/<\/lang>/gi, '')
        .replace(/<ruby>/gi, '')
        .replace(/<\/ruby>/gi, '')
        .replace(/<rt>/gi, '')
        .replace(/<\/rt>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    var cues = [];
    var blocks = content
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n{2,}/);

    for (var bi = 0; bi < blocks.length; bi++) {
      var blockLines = blocks[bi].split('\n').map(function(line) { return line.trim(); });
      var timeLineIndex = -1;

      for (var li = 0; li < blockLines.length; li++) {
        if (blockLines[li].indexOf('-->') !== -1) {
          timeLineIndex = li;
          break;
        }
      }

      if (timeLineIndex === -1) continue;

      var time = blockLines[timeLineIndex].split(/[\t ]*-->[\t ]*/);
      if (!time[0] || !time[1]) continue;

      var rawText = blockLines.slice(timeLineIndex + 1).join(' ');
      var text = cleanText(rawText);
      if (!text) continue;

      cues.push({
        start: toSeconds(time[0]),
        end: toSeconds(time[1]),
        speaker: extractSpeaker(rawText),
        text: text
      });
    }

    cues.sort(function(a, b) {
      return a.start - b.start || a.end - b.end;
    });

    var outputString = '<p>';
    var ltime = 0;
    var ltext;
    var lastSpeaker = null;
    var splitTime = typeof paraSplitTime !== 'undefined' ? paraSplitTime : 2;
    var pPunct = typeof paraPunct !== 'undefined' ? paraPunct : false;

    for (var ci = 0; ci < cues.length; ci++) {
      var sub = cues[ci];
      var speakerChanged = sub.speaker && sub.speaker !== lastSpeaker;
      if (speakerChanged) {
        if (outputString !== '<p>') {
          outputString += '</p><p>';
        }
        outputString += '<span class="speaker">' + escapeHtml(sub.speaker) + '</span>\n';
        lastSpeaker = sub.speaker;
      }

      var words = sub.text.split(' ').filter(function(word) { return word.length > 0; });
      var duration = sub.end - sub.start;
      if (duration <= 0) duration = 0.1;

      var totalLetters = 0;
      for (var wi = 0; wi < words.length; wi++) {
        totalLetters += words[wi].length;
      }

      var fallbackStep = duration / (words.length || 1);
      var letterTime = totalLetters > 0 ? duration / totalLetters : fallbackStep;
      var wordStart = 0;

      for (var wj = 0; wj < words.length; wj++) {
        var stime = Math.round((sub.start + wordStart) * 1000);
        var stext = words[wj];

        if (stime - ltime > splitTime * 1000 && splitTime > 0 && outputString !== '<p>') {
          var punctPresent = ltext && (ltext.indexOf('.') > 0 || ltext.indexOf('?') > 0 || ltext.indexOf('!') > 0 || ltext.indexOf('。') > 0 || ltext.indexOf('？') > 0 || ltext.indexOf('！') > 0);
          if (!pPunct || (pPunct && punctPresent)) {
            outputString += '</p><p>';
          }
        }

        outputString += '<span data-m="' + stime + '">' + escapeHtml(stext) + ' </span>\n';

        ltime = stime;
        ltext = stext;
        wordStart += totalLetters > 0 ? words[wj].length * letterTime : fallbackStep;
      }
    }

    outputString += '</p>';
    insertSubtitles(outputString);
    new HyperaudioLite("hypertranscript", "hyperplayer", minimizedMode, autoScroll, doubleClick, webMonetization, playOnClick);
  }

  function processSRT(content) {
    // Store for reprocessing
    if (typeof lastSubtitleContent !== 'undefined') {
      lastSubtitleContent = content;
      lastSubtitleType = '.srt';
    }
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
    // Store for reprocessing
    if (typeof lastSubtitleContent !== 'undefined') {
      lastSubtitleContent = content;
      lastSubtitleType = '.json';
    }
    var data = JSON.parse(content);
    var words;
    var paraSplit, commaSplit, outputString, lastEndTime, wi, word, gap;

    // Normalize to flat word array
    if (Array.isArray(data)) {
      // Flat array format: [{ text, start, end }]
      words = data.map(function(w) { return { word: w.text, start: w.start, end: w.end }; });
    } else if (data.segments) {
      // Nested format: { segments: [{ words: [{ word, start, end }] }] }
      words = data.segments.flatMap(function(seg) { return seg.words; });
    } else {
      console.error('Unsupported JSON format');
      return;
    }

    paraSplit = (typeof jsonSplitTime !== 'undefined') ? jsonSplitTime : 0.25;
    commaSplit = paraSplit * 0.6;
    outputString = '<p>start';
    lastEndTime = 0;

    for (wi = 0; wi < words.length; wi++) {
      word = words[wi];
      gap = word.start - lastEndTime;
      if (gap > paraSplit) {
        outputString += '</p><p>';
      } else if (gap > commaSplit) {
        outputString += '<span data-m="' + Math.round(word.start * 1000) + '" data-d="400">，</span>';
      }
      outputString += '<span data-m="' + Math.round(word.start * 1000) + '" data-d="' + Math.round((word.end - word.start) * 1000) + '">' + (/^[a-zA-Z]+$/.test(word.word) ? word.word + ' ' : word.word) + '</span>';
      lastEndTime = word.end;
    }

    outputString += '</p>';
    insertSubtitles(outputString);
    new HyperaudioLite("hypertranscript", "hyperplayer", minimizedMode, autoScroll, doubleClick, webMonetization, playOnClick);
  }

  function processASS(content) {
    if (typeof lastSubtitleContent !== 'undefined') {
      lastSubtitleContent = content;
      lastSubtitleType = '.ass';
    }

    var lines = content.split(/(?:\r\n|\r|\n)/gm);
    var len = lines.length;
    var outputString = '<p>';
    var lineBreaks = true;
    var ltime = 0;
    var ltext;

    var toSeconds = function(t_in) {
      if (!t_in) return 0;
      var t = t_in.split(':');
      try {
        var s = t[2].split('.');
        return (
          parseFloat(t[0], 10) * 3600 +
          parseFloat(t[1], 10) * 60 +
          parseFloat(s[0], 10) +
          parseFloat(s[1], 10) / 100
        );
      } catch (e) {
        return 0;
      }
    };

    for (var i = 0; i < len; i++) {
      var line = lines[i];
      if (!line.startsWith('Dialogue:')) continue;
      
      var parts = line.split(',');
      if (parts.length < 10) continue;

      var startStr = parts[1].trim();
      var endStr = parts[2].trim();
      var textParts = parts.slice(9);
      var text = textParts.join(',');

      var sub = {};
      sub.start = toSeconds(startStr);
      sub.end = toSeconds(endStr);

      text = text.replace(/\{[^}]+\}/g, '');
      text = text.replace(/\\N/g, ' ');
      text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      var splitMode = 0;
      // Minimal jQuery shim is present in test-desktop.html, but let's be safe
      var wordLengthSplit = false;
      if (typeof $ !== 'undefined' && $('#word-length').prop) {
        wordLengthSplit = $('#word-length').prop('checked');
      }
      
      var swords = text.split(' ');
      var sduration = sub.end - sub.start;
      if (sduration <= 0) sduration = 0.1; // fallback
      var stimeStep = sduration / (swords.length || 1);
      
      var swordLengths = [];
      var totalLetters = 0;
      for (var si = 0, sl = swords.length; si < sl; ++si) {
        totalLetters += swords[si].length;
        swordLengths[si] = swords[si].length;
      }
      var letterTime = totalLetters > 0 ? (sduration / totalLetters) : 0;
      var wordStart = 0;

      for (var si = 0, sl = swords.length; si < sl; ++si) {
        var wordTime = swordLengths[si] * letterTime;
        var stime;
        if (wordLengthSplit) {
          stime = Math.round((sub.start + si * stimeStep) * 1000);
        } else {
          stime = Math.round((wordStart + sub.start) * 1000);
        }

        wordStart += wordTime;
        var stext = swords[si];

        var splitTime = typeof paraSplitTime !== 'undefined' ? paraSplitTime : 2;
        var pPunct = typeof paraPunct !== 'undefined' ? paraPunct : false;

        if (stime - ltime > splitTime * 1000 && splitTime > 0) {
          var punctPresent = ltext && (ltext.indexOf('.') > 0 || ltext.indexOf('?') > 0 || ltext.indexOf('!') > 0);
          if (!pPunct || (pPunct && punctPresent)) {
            outputString += '</p><p>';
          }
        }

        outputString += '<span data-m="' + stime + '">' + stext + ' </span>';

        ltime = stime;
        ltext = stext;

        if (lineBreaks) outputString += '\n';
      }
    }
    outputString += '</p>';
    insertSubtitles(outputString);
    new HyperaudioLite("hypertranscript", "hyperplayer", minimizedMode, autoScroll, doubleClick, webMonetization, playOnClick);
  }
