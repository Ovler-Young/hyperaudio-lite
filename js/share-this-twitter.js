!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t(e.ShareThisViaTwitter=e.ShareThisViaTwitter||{})}(this,function(e){"use strict";function t(e,t,n){var r=this.getText(e);return'<a href="'+this.getShareUrl(r,n)+'" target="_blank" rel="noopener nofollow noreferrer"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 20 20"><path d="M16 3.038c-.59.26-1.22.437-1.885.517.677-.407 1.198-1.05 1.443-1.816-.634.37-1.337.64-2.085.79-.598-.64-1.45-1.04-2.396-1.04-1.812 0-3.282 1.47-3.282 3.28 0 .26.03.51.085.75-2.728-.13-5.147-1.44-6.766-3.42C.83 2.58.67 3.14.67 3.75c0 1.14.58 2.143 1.46 2.732-.538-.017-1.045-.165-1.487-.41v.04c0 1.59 1.13 2.918 2.633 3.22-.276.074-.566.114-.865.114-.21 0-.41-.02-.61-.058.42 1.304 1.63 2.253 3.07 2.28-1.12.88-2.54 1.404-4.07 1.404-.26 0-.52-.015-.78-.045 1.46.93 3.18 1.474 5.04 1.474 6.04 0 9.34-5 9.34-9.33 0-.14 0-.28-.01-.42.64-.46 1.2-1.04 1.64-1.7z" fill="currentcolor"/></svg></a>'}function n(e){var t=e.trim();return t.length>i-2&&(t=t.slice(0,i-3).trim()+"…"),"“"+t+"”"}function r(e,t){return"https://twitter.com/intent/tweet?text="+encodeURIComponent(e)+"&url="+encodeURIComponent(t)}function o(e,t){e.preventDefault(),t.ownerDocument.defaultView.open(t.firstChild.href,"share_via_twitter","height=440,location=no,menubar=no,scrollbars=no,status=no,toolbar=no,width=640").opener=null}var i=120;e.render=t,e.getText=n,e.getShareUrl=r,e.action=o,e.name="twitter",Object.defineProperty(e,"__esModule",{value:!0})});
