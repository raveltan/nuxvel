<script setup lang="ts">
defineProps<{ headings: string[]; rows: (string | number | null)[][] }>();
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr>
        <th v-for="heading in headings" :key="heading" class="px2 py1 text-left font-normal op50">
          {{ heading }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in rows" :key="index" class="border-t border-base">
        <td v-for="(cell, column) in row" :key="column" class="px2 py1 font-mono">
          {{ cell }}
        </td>
      </tr>
      <tr v-if="!rows.length">
        <td :colspan="headings.length" class="px2 py1 op50">
          None yet
        </td>
      </tr>
    </tbody>
  </table>
</template>
