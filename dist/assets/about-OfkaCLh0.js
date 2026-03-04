function e(){document.getElementById("view").innerHTML=`
    <div class="about-page">
      <h1 class="about-headline">The sound is the image.</h1>
      <p class="about-lead">Spiral Audio is an audio format where the waveform and the visual are the same object — not a visualization layered on top of audio, but a single file that <em>is</em> both.</p>

      <div class="about-section">
        <h2>How it works</h2>
        <p>When you encode a track, the audio waveform is mapped directly to the path of a spiral groove — the same way a vinyl record stores sound, but exact and digital. Every point on the spiral is an XY coordinate that encodes amplitude. There is no separate audio file. The SVG <em>is</em> the audio.</p>
        <p>Load the file anywhere and the player reads the groove geometry back into sound, applying the same equalization curve used in vinyl mastering (RIAA). What you hear is a mathematically precise reconstruction of what was encoded.</p>
      </div>

      <div class="about-section">
        <h2>The format</h2>
        <ul class="about-list">
          <li><strong>Open standard</strong> — plain SVG, readable by any browser</li>
          <li><strong>Lossless</strong> — 16-bit equivalent precision, no perceptual encoding</li>
          <li><strong>Stereo</strong> — M/S matrix encoding in the groove geometry</li>
          <li><strong>Efficient</strong> — delta-encoded coordinates compress well with gzip</li>
          <li><strong>Self-describing</strong> — all playback parameters are stored inside the file</li>
        </ul>
      </div>

      <div class="about-section">
        <h2>Why</h2>
        <p>Most audio formats separate sound from image. A JPEG of an album cover and an MP3 of the music are two different files that happen to travel together. Spiral Audio makes them the same thing.</p>
        <p>A Spiral record is a complete artifact. It looks like music because it is music. The groove density, spacing, and texture are not decoration — they are the audio data itself.</p>
      </div>

      <div class="about-section">
        <h2>Try it</h2>
        <p>Open the <a href="/studio" data-route="/studio">Studio</a> and drop in any audio file. The encoder will convert it to a spiral groove in seconds. Download the SVG, share it, or publish it to the feed.</p>
      </div>
    </div>`}export{e as aboutView};
