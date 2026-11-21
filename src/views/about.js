export function aboutView() {
  document.getElementById('view').innerHTML = `
    <div class="about-page">
      <h1 class="about-headline">Music you can own again</h1>
      <p class="about-lead">Streaming made every song free to hear and impossible to keep. Spiral brings back what vinyl always gave us: a copy that's yours, a shelf to show it on, and a reason to dig.</p>

      <div class="about-section">
        <h2>The Spiral is the record</h2>
        <p>Every release on Spiral is pressed as a Spiral, a visual groove that holds the music itself. Press play and watch the song turn. Each pressing is a limited, numbered edition, so when you own #12 of 500, everyone can see you were there early.</p>
      </div>

      <div class="about-section">
        <h2>Your collection, on display</h2>
        <p>Your profile is your record shelf. It shows every edition you own, its number, and when you got it. Follow other collectors, see what they're spinning, and find your next favorite through people whose taste you trust.</p>
      </div>

      <div class="about-section">
        <h2>Trade with other fans</h2>
        <p>Done with a record? Sell it to another fan on the Spiral marketplace. Every edition's history is tracked, so you always know it's the real one.</p>
      </div>

      <div class="about-section">
        <h2>Artists get paid every time</h2>
        <p>When a vinyl record resells, the artist sees nothing. On Spiral, artists earn a cut of every resale, for as long as their music keeps changing hands. Releasing on Spiral is free for artists, always.</p>
      </div>

      <div class="about-section">
        <h2>Membership</h2>
        <p>Spiral is free to join. Play your own collection and shop the marketplace at no cost. For $10 a month, members get 100 credits to spend on releases and can listen to any collector's library. Unused credits roll over for as long as you're a member.</p>
      </div>

      <div class="about-section">
        <h2>How it works</h2>
        <p><strong>A speaker pushes air.</strong> Every sound you hear is air being pushed and pulled. A speaker does this with electricity: the signal tells a cone to push forward or pull back, thousands of times a second, and that motion travels through the air to your ear as a soundwave.</p>
        <p><strong>A record is a picture of that motion.</strong> The groove in a vinyl record is the same push and pull, cut into a spiral. As the record turns, the needle rides the groove's wiggles and turns them back into the signal that moves the speaker. What you see in the groove is the sound.</p>
        <p><strong>Digital audio turned the picture into numbers.</strong> When music went digital, it was stored as long lists of numbers. Those files were too big for the computers and internet speeds of the time, so MP3 was invented to shrink them by throwing away sounds it guessed you wouldn't notice. Music got smaller, and it stopped being something you could see.</p>
        <p><strong>Spiral puts the picture back.</strong> Spiral is a new audio format where the geometry of the sound is the audio file. Every point along the spiral is one moment of push or pull, and one groove carries both speakers, just like vinyl. Nothing is stored beside the drawing. When you press play, Spiral reads the shape and turns it back into sound.</p>
      </div>
    </div>`;
}
