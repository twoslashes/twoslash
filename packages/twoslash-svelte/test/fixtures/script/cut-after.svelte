<script>
    let count = $state(0);
    // ---cut-after---
    function increment() {
        count++;
    }
</script>
<button onclick={increment}>
    Count is: {count}
</button>