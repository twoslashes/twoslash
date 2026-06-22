<script>
    let count = $state(0);
    function increment() {
        count++;
    }
    // ---cut-end---
</script>
<button onclick={increment}>
    Count is: {count}
</button>