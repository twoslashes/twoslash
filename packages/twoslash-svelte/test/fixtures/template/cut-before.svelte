<script>
    let count = $state(0);
    function increment() {
        count++;
    }
</script>
<!-- ---cut-before--- -->
<button onclick={increment}>
    Count is: {count}
</button>