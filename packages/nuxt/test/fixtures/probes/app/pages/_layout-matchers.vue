<template>
  <main class="probe">
    <h1>Layout probe</h1>
    <div id="row" class="row">
      <button id="cancel" type="button">Cancel</button>
      <button id="save" type="button">Save</button>
    </div>
    <label for="email">Email</label>
    <input id="email" type="email">
    <p>Saved two minutes ago</p>
    <a href="/_layout-matchers">Layout probe link</a>
    <table>
      <tbody>
        <tr><td>Harbour festival</td></tr>
      </tbody>
    </table>
    <button type="button">Delete article 1</button>
    <div role="alert">Post deleted</div>
    <div role="dialog" aria-label="Delete post?">
      <button type="button">Delete</button>
    </div>
    <p id="hidden" hidden>Hidden</p>
  </main>
</template>

<style scoped>
.probe {
  width: 400px;
}

.row {
  display: flex;
  gap: 10px;
}

.row.reversed {
  flex-direction: row-reverse;
}
</style>
